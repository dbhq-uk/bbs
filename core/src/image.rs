use crate::font::candidate_masks;
use crate::screen::{Cell, Colour, Screen, PALETTE};

/// Glyph cell size in pixels. This is why aspect correction is mandatory: a
/// cell is twice as tall as it is wide, so sampling a square region per cell
/// would stretch every image to double height.
const CELL_W: u32 = 8;
const CELL_H: u32 = 16;
const SAMPLES: usize = (CELL_W * CELL_H) as usize;

/// No colour dithering. The shade glyphs are the dither.
///
/// This started as a 4x4 Bayer nudge on the mapped colour, which looked
/// right on paper and was wrong in practice: the matrix is indexed per
/// CELL, not per pixel, so a flat background alternated between two palette
/// entries at 8x16-pixel granularity and read as a coarse checkerboard
/// rather than as texture. Verified by eye on a test image, 8 Sep 2026.
///
/// The fix is to delete it rather than tune it. `░`, `▒` and `▓` with two
/// palette colours already give 25%, 50% and 75% blends, which is exactly
/// how a BBS artist got intermediate tones, and `choose_glyph` picks them
/// on their own merits when the true colour sits between two palette
/// entries. A per-cell nudge on top of that is noise, not dithering.
#[derive(Debug, Clone, Copy)]
pub struct Options {
    pub cols: u16,
    pub max_rows: u16,
    pub monochrome: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            cols: 80,
            max_rows: 37,
            monochrome: false,
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

pub fn quantise_with(rgba: &[u8], w: u32, h: u32, opts: Options) -> Screen {
    if w == 0 || h == 0 || opts.cols == 0 {
        return Screen::new(0, 0);
    }

    // Aspect correction. Each output cell covers CELL_W x CELL_H source
    // pixels after scaling, so the row count follows from the source aspect
    // ratio divided by the cell aspect ratio.
    let cols = opts.cols as u32;
    let rows = {
        let r = (h as f32 * cols as f32 * CELL_W as f32) / (w as f32 * CELL_H as f32);
        (r.round() as u32).clamp(1, opts.max_rows as u32)
    };

    let mut screen = Screen::new(cols as u16, rows as u16);
    let masks = candidate_masks();
    let mut cell = [(0u8, 0u8, 0u8); SAMPLES];

    for cy in 0..rows {
        for cx in 0..cols {
            sample_cell(rgba, w, h, cx, cy, cols, rows, &mut cell);
            screen.set(cx as u16, cy as u16, choose_glyph(&cell, &masks, &opts));
        }
    }
    screen
}

/// The 8x16 block of source pixels behind one output cell, as RGB triples.
///
/// Box-filters rather than point-samples. At 80 columns the whole target
/// raster is 640px wide, so a 1200px source contributes under a third of its
/// pixels if you point-sample, and fine texture, diagonals and small text
/// alias badly.
///
/// Alpha is composited against black here rather than ignored, or every
/// transparent PNG picks up a black rectangle and dark halos.
#[allow(clippy::too_many_arguments)]
fn sample_cell(
    rgba: &[u8],
    w: u32,
    h: u32,
    cx: u32,
    cy: u32,
    cols: u32,
    rows: u32,
    out: &mut [(u8, u8, u8); SAMPLES],
) {
    let total_w = (cols * CELL_W) as f32;
    let total_h = (rows * CELL_H) as f32;

    for py in 0..CELL_H {
        for px in 0..CELL_W {
            // The source rectangle this output sub-pixel covers.
            let x0 = ((cx * CELL_W + px) as f32 / total_w * w as f32).floor() as u32;
            let x1 = (((cx * CELL_W + px + 1) as f32 / total_w * w as f32).ceil() as u32)
                .clamp(x0 + 1, w);
            let y0 = ((cy * CELL_H + py) as f32 / total_h * h as f32).floor() as u32;
            let y1 = (((cy * CELL_H + py + 1) as f32 / total_h * h as f32).ceil() as u32)
                .clamp(y0 + 1, h);

            let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let i = ((sy * w + sx) * 4) as usize;
                    if i + 3 >= rgba.len() {
                        continue;
                    }
                    let a = rgba[i + 3] as u32;
                    r += rgba[i] as u32 * a / 255;
                    g += rgba[i + 1] as u32 * a / 255;
                    b += rgba[i + 2] as u32 * a / 255;
                    n += 1;
                }
            }
            // n is zero only when the source rectangle fell entirely
            // outside the buffer, which the clamps above make unreachable;
            // dividing by max(1) keeps it total without a branch.
            let n = n.max(1);
            out[(py * CELL_W + px) as usize] = ((r / n) as u8, (g / n) as u8, (b / n) as u8);
        }
    }
}

/// Chooses the glyph and its two colours together, by reconstruction error.
///
/// The obvious implementation picks a luminance midpoint, binarises, matches
/// the shape, then colours the result. That is wrong twice over: a single
/// bright outlier drags the midpoint and destabilises the mask on
/// photographs, and the colour choice cannot influence the shape choice even
/// though the two interact.
///
/// Instead, for each candidate glyph: partition the cell's samples by that
/// glyph's own bitmap, take the mean colour of each side, map both to the
/// palette, then score how far the reconstructed cell is from the source.
/// The winner is the (glyph, fg, bg) triple with the lowest error, which is
/// the quantity we actually care about. Same cost, no arbitrary threshold.
fn choose_glyph(cell: &[(u8, u8, u8); SAMPLES], masks: &[(u8, u128)], opts: &Options) -> Cell {
    let mut best = Cell {
        ch: b' ',
        fg: Colour::Grey,
        bg: Colour::Black,
    };
    let mut best_err = u64::MAX;

    for &(code, m) in masks {
        // Mean colour of the pixels this glyph would paint, and of the rest.
        let (fg_rgb, fg_n) = mean_where(cell, m, true);
        let (bg_rgb, bg_n) = mean_where(cell, m, false);

        // A glyph covering everything or nothing has no shape, so its empty
        // side carries no colour evidence. Fall back to the other side.
        let fg_rgb = if fg_n == 0 { bg_rgb } else { fg_rgb };
        let bg_rgb = if bg_n == 0 { fg_rgb } else { bg_rgb };

        let fg = map_colour(fg_rgb, opts);
        let bg = map_colour(bg_rgb, opts);
        let err = reconstruction_error(cell, m, fg, bg);

        if err < best_err {
            best_err = err;
            best = Cell { ch: code, fg, bg };
        }
    }
    best
}

/// Mean colour of the samples where the glyph bit is set (or clear).
fn mean_where(cell: &[(u8, u8, u8); SAMPLES], mask: u128, set: bool) -> ((u8, u8, u8), u32) {
    let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
    for (i, &c) in cell.iter().enumerate() {
        let bit = (mask >> (127 - i)) & 1 == 1;
        if bit == set {
            r += c.0 as u32;
            g += c.1 as u32;
            b += c.2 as u32;
            n += 1;
        }
    }
    if n == 0 {
        return ((0, 0, 0), 0);
    }
    (((r / n) as u8, (g / n) as u8, (b / n) as u8), n)
}

/// Squared RGB distance between the source cell and what this glyph and
/// colour pair would actually draw.
fn reconstruction_error(cell: &[(u8, u8, u8); SAMPLES], mask: u128, fg: Colour, bg: Colour) -> u64 {
    let f = PALETTE[fg as usize];
    let b = PALETTE[bg as usize];
    let mut err = 0u64;
    for (i, &c) in cell.iter().enumerate() {
        let bit = (mask >> (127 - i)) & 1 == 1;
        let p = if bit { f } else { b };
        let dr = c.0 as i64 - p.0 as i64;
        let dg = c.1 as i64 - p.1 as i64;
        let db = c.2 as i64 - p.2 as i64;
        err += (dr * dr + dg * dg + db * db) as u64;
    }
    err
}

/// Nearest palette entry. See the note on Options: there is deliberately no
/// dither nudge here, because the shade glyphs do that job properly.
fn map_colour(rgb: (u8, u8, u8), opts: &Options) -> Colour {
    let (r, g, b) = (rgb.0 as i32, rgb.1 as i32, rgb.2 as i32);

    if opts.monochrome {
        let l = (299 * r + 587 * g + 114 * b) / 1000;
        return if l > 127 {
            Colour::White
        } else {
            Colour::Black
        };
    }

    let mut best = (0u8, i32::MAX);
    for (i, &(pr, pg, pb)) in PALETTE.iter().enumerate() {
        let d = (r - pr as i32).pow(2) + (g - pg as i32).pow(2) + (b - pb as i32).pow(2);
        if d < best.1 {
            best = (i as u8, d);
        }
    }
    Colour::from_index(best.0)
}
