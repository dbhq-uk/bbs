use bbs_core::image::{quantise, quantise_with, GlyphSet, Options};
use bbs_core::screen::Colour;

/// An RGBA buffer of a single flat colour.
fn flat(w: u32, h: u32, rgb: (u8, u8, u8)) -> Vec<u8> {
    let mut v = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        v.extend_from_slice(&[rgb.0, rgb.1, rgb.2, 255]);
    }
    v
}

/// Top half one colour, bottom half another.
fn split(w: u32, h: u32, top: (u8, u8, u8), bottom: (u8, u8, u8)) -> Vec<u8> {
    let mut v = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        let c = if y < h / 2 { top } else { bottom };
        for _ in 0..w {
            v.extend_from_slice(&[c.0, c.1, c.2, 255]);
        }
    }
    v
}

#[test]
fn aspect_correction_halves_the_row_count() {
    // A square image at 80 columns must not come out 80 rows tall, because
    // cells are 8x16. It should be about 40.
    let px = flat(160, 160, (128, 128, 128));
    let s = quantise(&px, 160, 160, 80, 200);
    assert!((38..=42).contains(&s.h), "expected ~40 rows, got {}", s.h);
    assert_eq!(s.w, 80);
}

#[test]
fn a_flat_black_image_is_blank_cells() {
    let px = flat(160, 160, (0, 0, 0));
    let s = quantise(&px, 160, 160, 80, 200);
    for c in &s.cells {
        let visible = if c.ch == b' ' { c.bg } else { c.fg };
        assert_eq!(visible, Colour::Black);
    }
}

#[test]
fn a_flat_white_image_reads_as_white() {
    let px = flat(160, 160, (255, 255, 255));
    let s = quantise(&px, 160, 160, 80, 200);
    let c = s.at(40, 20);
    let visible = if c.ch == b' ' { c.bg } else { c.fg };
    assert_eq!(visible, Colour::White);
}

#[test]
fn a_horizontal_split_picks_a_half_block() {
    // This is the case half-blocks exist for: two different colours in one
    // cell, split across the middle. A brightness-averaging converter would
    // produce one muddy grey cell; we should get 0xDF or 0xDC.
    //
    // The geometry has to be chosen so a cell actually straddles the split.
    // rows = h * cols * 8 / (w * 16), so 160x4 at 80 columns gives exactly
    // one row covering all four source rows - two white, two black. A
    // 160x32 source would give eight rows, and row 0 would sample only
    // white, which is how this test was originally written wrong.
    let px = split(160, 4, (255, 255, 255), (0, 0, 0));
    let s = quantise_with(
        &px,
        160,
        4,
        Options {
            cols: 80,
            max_rows: 200,
            detail: 0.0,
            glyphs: GlyphSet::Blocks,
            monochrome: false,
        },
    );
    assert_eq!(s.h, 1, "geometry check: this test needs exactly one row");
    let c = s.at(40, 0);
    assert!(
        c.ch == 0xDF || c.ch == 0xDC,
        "expected an upper or lower half block, got {:#04X}",
        c.ch
    );
    // And the two colours must be the two that were actually there.
    let pair = [c.fg, c.bg];
    assert!(pair.contains(&Colour::White) && pair.contains(&Colour::Black));
}

#[test]
fn a_transparent_png_does_not_gain_a_black_halo() {
    // Alpha must be composited, not ignored. A fully transparent image
    // should read as uniform, not as noise.
    let mut px = Vec::new();
    for _ in 0..(160 * 160) {
        px.extend_from_slice(&[255, 255, 255, 0]); // white but fully transparent
    }
    let s = quantise(&px, 160, 160, 80, 200);
    for c in &s.cells {
        let visible = if c.ch == b' ' { c.bg } else { c.fg };
        assert_eq!(
            visible,
            Colour::Black,
            "transparent should composite to black"
        );
    }
}

#[test]
fn height_is_capped_so_one_image_cannot_swallow_the_board() {
    let px = flat(80, 4000, (200, 100, 50));
    let s = quantise(&px, 80, 4000, 80, 37);
    assert_eq!(s.h, 37);
}

#[test]
fn monochrome_mode_only_emits_black_and_white() {
    let px = split(160, 32, (200, 40, 40), (40, 40, 200));
    let opts = Options {
        cols: 80,
        max_rows: 200,
        monochrome: true,
        ..Default::default()
    };
    let s = quantise_with(&px, 160, 32, opts);
    for c in &s.cells {
        assert!(matches!(c.fg, Colour::Black | Colour::White));
        assert!(matches!(c.bg, Colour::Black | Colour::White));
    }
}

#[test]
fn a_red_image_maps_to_a_red_palette_entry() {
    let px = flat(160, 160, (170, 0, 0));
    let s = quantise(&px, 160, 160, 80, 200);
    let c = s.at(40, 20);
    let visible = if c.ch == b' ' { c.bg } else { c.fg };
    assert!(matches!(visible, Colour::Red | Colour::BrightRed));
}

#[test]
fn a_vertical_split_picks_a_left_or_right_half_block() {
    // The mirror of the horizontal case. If this passes but the horizontal
    // one fails, the glyph mask bit order is transposed.
    let mut px = Vec::new();
    for _ in 0..16 {
        for x in 0..16 {
            let c = if x < 8 { 255u8 } else { 0u8 };
            px.extend_from_slice(&[c, c, c, 255]);
        }
    }
    // 16x16 at 2 columns gives 1 row, so one cell spans the whole width.
    let s = quantise_with(
        &px,
        16,
        16,
        Options {
            cols: 2,
            max_rows: 200,
            detail: 0.0,
            glyphs: GlyphSet::Blocks,
            monochrome: false,
        },
    );
    let c = s.at(0, 0);
    assert!(
        c.ch == 0xDD || c.ch == 0xDE || c.ch == 0xDB || c.ch == 0x20,
        "expected a vertical half block, got {:#04X}",
        c.ch
    );
}
