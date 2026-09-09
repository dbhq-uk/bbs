//! Image to CP437 quantisation.
//!
//! Three things were wrong in the first implementation and all three are
//! fixed here. Recording them because each is easy to reintroduce.
//!
//! 1. **The colour pair came from the glyph's own partition.** On a flat
//!    cell both partitions have the same mean, so foreground and background
//!    quantised to the same palette entry and no blend was ever *proposed*,
//!    never mind chosen. Shade glyphs were structurally unreachable. The
//!    search now considers palette pairs independently of the partition.
//! 2. **Nearest-neighbour in sRGB.** Euclidean RGB distance is not
//!    perceptual, and this palette has only four neutrals, so desaturated
//!    mid-tones landed on saturated entries - a neutral grey background came
//!    out bright cyan. Everything is Oklab now.
//! 3. **Per-pixel error only.** At viewing distance the eye integrates a
//!    dot lattice into its mean, but per-pixel squared error charges a
//!    mixture for its variance, so a solid block beat every blend. The
//!    objective is now mostly a filtered (tonal) term with a smaller native
//!    (structural) term, which is the standard shape of a model-based
//!    halftoning objective.
//!
//! The candidate set is the whole font. chafa's documentation is explicit
//! that more symbols greatly improves quality, and the decomposition below
//! makes the per-candidate cost O(1), so there is no reason to restrict it.

use crate::colour::{linear_to_oklab, palette_linear_of, palette_oklab_of, srgb_to_linear, Lab};
use crate::screen::{Cell, Colour, Screen};

const CELL_W: u32 = 8;

/// The tallest cell, and therefore the size of the per-cell buffers.
///
/// A cell is 8x16 in the 80x25 mode and 8x8 in the 80x50 mode. The buffers
/// are sized for the larger and only the first `samples` entries are used,
/// which keeps them on the stack instead of allocating per cell.
const MAX_SAMPLES: usize = 128;

/// How the sixteen colours are chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaletteMode {
    /// The fixed DOS palette. What a stock VGA card powered up with.
    Dos,
    /// Sixteen chosen for this image and snapped to the VGA DAC's six bits
    /// per channel - what ACiD's XBIN format was built to carry, and the
    /// single largest quality lever the quantiser has.
    Auto,
    /// A palette supplied by the caller.
    Fixed([(u8, u8, u8); 16]),
}

/// How much of the objective is the filtered (tonal) term. The rest is the
/// native (structural) term.
///
/// The tonal term is what the eye sees at viewing distance and is what lets
/// a shade glyph beat a solid block on an off-palette colour. The native
/// term stops a numerically excellent mixture winning when its individual
/// dots would be visible, and preserves genuine one-pixel detail.
///
/// Swept empirically on a portrait: 0.9 makes shape almost irrelevant, so
/// glyphs get picked for their coverage fraction and the output is
/// scratchy; 0.15 collapses smooth regions to solid blocks. 0.5 is the
/// balance, and it stopped mattering much once local contrast was added,
/// which is the real fix for detail.
const W_TONAL: f32 = 0.5;
const W_NATIVE: f32 = 1.0 - W_TONAL;

#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub cols: u16,
    pub max_rows: u16,
    pub monochrome: bool,
    pub glyphs: GlyphSet,
    /// Use the art font: the same glyphs, with the alphabet slots carrying
    /// a sixteen-rung shade ramp instead of letters.
    ///
    /// CP437 offers three shade densities, so with space and the full block
    /// the quantiser has five rungs to represent continuous tone on. This is
    /// XBIN's custom-font feature, used for what it was invented for.
    pub art_font: bool,
    /// Cell height in pixels: 16 for the 80x25 mode, 8 for 80x50.
    ///
    /// Halving it doubles the rows for the same picture, so it doubles the
    /// vertical samples. Both are real VGA text modes.
    pub cell_h: u32,
    /// Where the sixteen colours come from.
    pub palette: PaletteMode,
    /// Local detail boost, 0 disables it.
    ///
    /// A face's internal variation is often smaller than the gap between
    /// adjacent palette entries, so the whole face posterises to one flat
    /// tone and the eyes vanish. An unsharp mask on luminance restores the
    /// local contrast the palette needs to represent them.
    ///
    /// Deliberately NOT CLAHE: adaptive histogram equalisation elevates
    /// pores, JPEG noise and background texture to the same status as the
    /// features you want, which is a known failure mode.
    pub detail: f32,
}

/// Which glyphs the quantiser may choose from.
///
/// `Blocks` is chafa's default register and it is the default here for the
/// same reason: letters and accented characters carry strong, arbitrary
/// shapes that read as ransom-note noise rather than as tone, even when
/// they score well. `All` is the whole font and is genuinely better on
/// dense, detailed sources where the extra shape vocabulary pays for
/// itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GlyphSet {
    Blocks,
    Box,
    All,
    /// Blocks plus the art font's sixteen-rung shade ramp. Only meaningful
    /// with `art_font: true`, which is what puts those glyphs there.
    Art,
    /// Printable ASCII only, for output that can be pasted anywhere.
    ///
    /// The block and shade glyphs are CP437, so text using them survives
    /// only where that code page or its Unicode equivalents do. A reader
    /// who wants ASCII art for a README, a signature or a terminal needs
    /// characters from the 95 everyone has.
    Ascii,
}

impl GlyphSet {
    fn allows(self, code: u8) -> bool {
        match self {
            GlyphSet::All => true,
            // Space, the three shades, the full block and the four half
            // blocks. Deliberately NO box drawing: its thin strokes have
            // clustered coverage that only makes sense on a real edge, and
            // when the tonal term dominates they get chosen for their
            // coverage fraction alone and read as scratchy noise.
            GlyphSet::Blocks => matches!(
                code,
                0x20 | 0xB0 | 0xB1 | 0xB2 | 0xDB | 0xDC | 0xDD | 0xDE | 0xDF
            ),
            GlyphSet::Box => code == 0x20 || (0xB0..=0xDF).contains(&code) || code == 0xFE,
            GlyphSet::Art => {
                GlyphSet::Blocks.allows(code) || crate::font::ART_SHADES.contains(&code)
            }
            GlyphSet::Ascii => (0x20..=0x7E).contains(&code),
        }
    }
}

impl Default for Options {
    fn default() -> Self {
        Options {
            cols: 80,
            max_rows: 37,
            monochrome: false,
            glyphs: GlyphSet::Blocks,
            art_font: false,
            cell_h: 16,
            palette: PaletteMode::Dos,
            detail: 1.2,
        }
    }
}

pub fn quantise(rgba: &[u8], w: u32, h: u32, cols: u16, max_rows: u16) -> Screen {
    quantise_with(
        rgba,
        w,
        h,
        Options {
            cols,
            max_rows,
            ..Default::default()
        },
    )
}

/// Everything precomputed once per conversion rather than per cell.
struct Tables {
    /// Every glyph's bitmap as a 128-bit mask, and how many bits it sets.
    glyphs: Vec<(u8, u128, u32)>,
    pal_lab: [Lab; 16],
    /// Pixels per cell: 8 * cell_h.
    samples: usize,
    /// Oklab of every (fg, bg, coverage) blend. Coverage is a count of set
    /// pixels, 0..=128, so this is exact rather than interpolated.
    blend: Vec<Lab>,
}

impl Tables {
    fn new(
        mono: bool,
        set: GlyphSet,
        pal: &[(u8, u8, u8); 16],
        cell_h: u32,
        art_font: bool,
    ) -> Self {
        let pal_lin = palette_linear_of(pal);
        let pal_lab = palette_oklab_of(pal);
        let samples = (CELL_W * cell_h) as usize;

        let allowed: Vec<u8> = if mono { vec![0, 15] } else { (0..16).collect() };

        let mut blend = vec![
            Lab {
                l: 0.0,
                a: 0.0,
                b: 0.0
            };
            16 * 16 * (MAX_SAMPLES + 1)
        ];
        for &f in &allowed {
            for &b in &allowed {
                for n in 0..=samples {
                    // Mix in linear light, then convert. Mixing in sRGB or
                    // in Oklab both give the wrong colour for a dot lattice.
                    let a = n as f32 / samples as f32;
                    let (fr, fg_, fb) = pal_lin[f as usize];
                    let (br, bg_, bb) = pal_lin[b as usize];
                    let lab = linear_to_oklab(
                        a * fr + (1.0 - a) * br,
                        a * fg_ + (1.0 - a) * bg_,
                        a * fb + (1.0 - a) * bb,
                    );
                    blend[blend_index(f, b, n)] = lab;
                }
            }
        }

        // The whole font, minus glyphs whose coverage duplicates another's
        // bitmap exactly - they are unreachable and only cost time. That
        // also makes the art ramp free of duplicates: three of its sixteen
        // rungs land exactly on the stock shades and are dropped here.
        let font = if art_font {
            crate::font::art_font_for(cell_h)
        } else {
            crate::font::font_for(cell_h)
        };
        let mut seen = std::collections::HashSet::new();
        let mut glyphs = Vec::with_capacity(256);
        for code in 0u8..=255 {
            if !set.allows(code) {
                continue;
            }
            let m = crate::font::glyph_mask_in(font, code, cell_h);
            if seen.insert(m) {
                glyphs.push((code, m, m.count_ones()));
            }
        }

        Tables {
            glyphs,
            pal_lab,
            samples,
            blend,
        }
    }
}

fn blend_index(f: u8, b: u8, n: usize) -> usize {
    ((f as usize) * 16 + (b as usize)) * (MAX_SAMPLES + 1) + n
}

pub fn quantise_with(rgba: &[u8], w: u32, h: u32, opts: Options) -> Screen {
    quantise_full(rgba, w, h, opts).screen
}

/// A quantised image and the sixteen colours it was drawn with.
///
/// The palette travels WITH the screen because it has to: under
/// PaletteMode::Auto the cell values are indices into a palette that exists
/// only for this image, so a renderer handed the screen alone would draw it
/// in DOS colours and produce something quite unlike what was measured.
pub struct Quantised {
    pub screen: Screen,
    pub palette: [(u8, u8, u8); 16],
}

pub fn quantise_full(rgba: &[u8], w: u32, h: u32, opts: Options) -> Quantised {
    let palette = match opts.palette {
        PaletteMode::Dos => crate::screen::PALETTE,
        PaletteMode::Fixed(p) => p,
        // Chosen from the ORIGINAL pixels, before the detail boost. The
        // unsharp mask pushes values past what the picture contains, and a
        // palette fitted to those overshoots represents colours that are
        // not in the image.
        PaletteMode::Auto => crate::palette::choose(rgba, w, h),
    };

    if w == 0 || h == 0 || opts.cols == 0 {
        return Quantised {
            screen: Screen::new(0, 0),
            palette,
        };
    }
    let cell_h = opts.cell_h.clamp(1, 16);
    let rgba = &local_contrast(rgba, w, h, opts.detail);

    // Aspect correction. A cell is twice as tall as it is wide, so sampling
    // a square region per cell would stretch every image to double height.
    let cols = opts.cols as u32;
    let rows = {
        let r = (h as f32 * cols as f32 * CELL_W as f32) / (w as f32 * cell_h as f32);
        (r.round() as u32).clamp(1, opts.max_rows as u32)
    };

    let t = Tables::new(
        opts.monochrome,
        opts.glyphs,
        &palette,
        cell_h,
        opts.art_font,
    );
    let mut screen = Screen::new(cols as u16, rows as u16);
    let mut cell = [(0.0f32, 0.0f32, 0.0f32); MAX_SAMPLES];

    for cy in 0..rows {
        for cx in 0..cols {
            sample_cell(rgba, w, h, cx, cy, cols, rows, cell_h, &mut cell);
            screen.set(cx as u16, cy as u16, choose_glyph(&cell, &t, &opts));
        }
    }
    Quantised { screen, palette }
}

/// The 8x16 block of source pixels behind one output cell, in LINEAR light.
///
/// Box-filters rather than point-samples: at 80 columns the whole raster is
/// 640px wide, so point-sampling a 1200px source discards most of it and
/// aliases fine texture badly. Alpha is composited against black, or every
/// transparent PNG gains a black rectangle and dark halos.
#[allow(clippy::too_many_arguments)]
fn sample_cell(
    rgba: &[u8],
    w: u32,
    h: u32,
    cx: u32,
    cy: u32,
    cols: u32,
    rows: u32,
    cell_h: u32,
    out: &mut [(f32, f32, f32); MAX_SAMPLES],
) {
    let total_w = (cols * CELL_W) as f32;
    let total_h = (rows * cell_h) as f32;

    for py in 0..cell_h {
        for px in 0..CELL_W {
            let x0 = ((cx * CELL_W + px) as f32 / total_w * w as f32).floor() as u32;
            let x1 = (((cx * CELL_W + px + 1) as f32 / total_w * w as f32).ceil() as u32)
                .clamp(x0 + 1, w);
            let y0 = ((cy * cell_h + py) as f32 / total_h * h as f32).floor() as u32;
            let y1 = (((cy * cell_h + py + 1) as f32 / total_h * h as f32).ceil() as u32)
                .clamp(y0 + 1, h);

            let (mut r, mut g, mut b, mut n) = (0.0f32, 0.0f32, 0.0f32, 0u32);
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = ((sy * w + sx) * 4) as usize;
                    if i + 3 >= rgba.len() {
                        continue;
                    }
                    let a = rgba[i + 3] as f32 / 255.0;
                    r += srgb_to_linear(rgba[i]) * a;
                    g += srgb_to_linear(rgba[i + 1]) * a;
                    b += srgb_to_linear(rgba[i + 2]) * a;
                    n += 1;
                }
            }
            let n = n.max(1) as f32;
            out[(py * CELL_W + px) as usize] = (r / n, g / n, b / n);
        }
    }
}

/// Chooses glyph, foreground and background jointly.
///
/// The cost is kept down by decomposing the per-pixel term. For a glyph
/// mask, the native error is
///
///   sum over set pixels of |sample - Cf|^2 + sum over clear pixels of |sample - Cb|^2
///
/// and each of those expands to `sumsq - 2 C . sum + n |C|^2`, so once the
/// per-partition count, vector sum and scalar sum-of-squares are known the
/// error for any colour pair is O(1). That is what makes searching the
/// whole font against 36 colour pairs affordable.
fn choose_glyph(cell: &[(f32, f32, f32); MAX_SAMPLES], t: &Tables, opts: &Options) -> Cell {
    // Oklab of every sample, and the cell's mean colour in linear light.
    let mut lab = [Lab {
        l: 0.0,
        a: 0.0,
        b: 0.0,
    }; MAX_SAMPLES];
    let (mut mr, mut mg, mut mb) = (0.0f32, 0.0f32, 0.0f32);
    for (i, &(r, g, b)) in cell.iter().take(t.samples).enumerate() {
        lab[i] = linear_to_oklab(r, g, b);
        mr += r;
        mg += g;
        mb += b;
    }
    let n = t.samples as f32;
    let mean_lab = linear_to_oklab(mr / n, mg / n, mb / n);

    // ALL ordered palette pairs, not the ones nearest the cell mean.
    //
    // Pruning by proximity to the mean is structurally hostile to detail:
    // an eye needs a dark foreground against a lighter background whose
    // coverage-weighted blend matches skin, and that dark entry is nowhere
    // near the cell mean, so pruning removed it before it could be scored.
    // With only 16 colours there is no defensible reason to prune at all.
    let near: &[u8] = if opts.monochrome { &[0, 15] } else { &ALL_16 };

    let mut best = Cell {
        ch: b' ',
        fg: Colour::Grey,
        bg: Colour::Black,
    };
    let mut best_err = f32::INFINITY;

    for &(code, mask, set_n) in &t.glyphs {
        // Partition sums, computed once per glyph rather than per pair.
        let (mut s_l, mut s_a, mut s_b, mut s_q) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        let (mut c_l, mut c_a, mut c_b, mut c_q) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        for (i, &p) in lab.iter().take(t.samples).enumerate() {
            let q = p.l * p.l + p.a * p.a + p.b * p.b;
            if (mask >> (127 - i)) & 1 == 1 {
                s_l += p.l;
                s_a += p.a;
                s_b += p.b;
                s_q += q;
            } else {
                c_l += p.l;
                c_a += p.a;
                c_b += p.b;
                c_q += q;
            }
        }
        let set_f = set_n as f32;
        let clr_f = (t.samples as u32 - set_n) as f32;

        for &f in near.iter() {
            let cf = t.pal_lab[f as usize];
            // sumsq - 2 C . sum + n |C|^2
            let e_fg = s_q - 2.0 * (cf.l * s_l + cf.a * s_a + cf.b * s_b)
                + set_f * (cf.l * cf.l + cf.a * cf.a + cf.b * cf.b);

            for &b in near.iter() {
                let cb = t.pal_lab[b as usize];
                let e_bg = c_q - 2.0 * (cb.l * c_l + cb.a * c_a + cb.b * c_b)
                    + clr_f * (cb.l * cb.l + cb.a * cb.a + cb.b * cb.b);

                let native = (e_fg + e_bg) / n;
                let tonal = t.blend[blend_index(f, b, set_n as usize)].dist2(mean_lab);

                let err = W_TONAL * tonal + W_NATIVE * native;
                if err < best_err {
                    best_err = err;
                    best = Cell {
                        ch: code,
                        fg: Colour::from_index(f),
                        bg: Colour::from_index(b),
                    };
                }
            }
        }
    }
    best
}

const ALL_16: [u8; 16] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/// Unsharp mask on luminance only, in linear light.
///
/// Chroma is left alone: boosting it produces lurid colour fringing at
/// every edge, and the information the palette is losing is tonal.
fn local_contrast(rgba: &[u8], w: u32, h: u32, amount: f32) -> Vec<u8> {
    if amount <= 0.0 {
        return rgba.to_vec();
    }
    let n = (w * h) as usize;
    // Luminance in linear light.
    let mut lum = vec![0.0f32; n];
    for (i, l) in lum.iter_mut().enumerate() {
        let j = i * 4;
        if j + 2 >= rgba.len() {
            break;
        }
        *l = 0.2126 * srgb_to_linear(rgba[j])
            + 0.7152 * srgb_to_linear(rgba[j + 1])
            + 0.0722 * srgb_to_linear(rgba[j + 2]);
    }

    // Blur radius scaled to the image, so the operator works on features
    // rather than on a fixed pixel count.
    let r = ((w.min(h) as f32) * 0.02).round().max(1.0) as i32;
    let blur = box_blur(&lum, w, h, r);

    let mut out = rgba.to_vec();
    for i in 0..n {
        let j = i * 4;
        if j + 2 >= out.len() {
            break;
        }
        let detail = lum[i] - blur[i];
        let target = (lum[i] + amount * detail).clamp(0.0, 1.0);
        // Scale the three channels by the luminance ratio, preserving hue.
        let k = if lum[i] > 1e-4 { target / lum[i] } else { 1.0 };
        for c in 0..3 {
            let v = srgb_to_linear(out[j + c]) * k;
            out[j + c] = linear_to_srgb(v.clamp(0.0, 1.0));
        }
    }
    out
}

/// Two passes of a box blur, which is a good enough Gaussian here and is
/// separable and O(1) per pixel.
fn box_blur(src: &[f32], w: u32, h: u32, r: i32) -> Vec<f32> {
    let mut a = blur_1d(src, w, h, r, true);
    a = blur_1d(&a, w, h, r, false);
    a
}

fn blur_1d(src: &[f32], w: u32, h: u32, r: i32, horizontal: bool) -> Vec<f32> {
    let (w, h) = (w as i32, h as i32);
    let mut out = vec![0.0f32; (w * h) as usize];
    let (outer, inner) = if horizontal { (h, w) } else { (w, h) };
    for o in 0..outer {
        for i in 0..inner {
            let mut sum = 0.0;
            let mut n = 0.0;
            for k in -r..=r {
                let p = (i + k).clamp(0, inner - 1);
                let idx = if horizontal { o * w + p } else { p * w + o };
                sum += src[idx as usize];
                n += 1.0;
            }
            let idx = if horizontal { o * w + i } else { i * w + o };
            out[idx as usize] = sum / n;
        }
    }
    out
}

fn linear_to_srgb(c: f32) -> u8 {
    let v = if c <= 0.003_130_8 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}
