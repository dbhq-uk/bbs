use bbs_core::font::{glyph, glyph_mask, CANDIDATES, FONT};

#[test]
fn font_is_exactly_256_glyphs_of_16_rows() {
    assert_eq!(FONT.len(), 4096);
}

#[test]
fn space_is_blank_and_full_block_is_solid() {
    assert_eq!(glyph(0x20), &[0u8; 16]);
    assert_eq!(glyph(0xDB), &[0xFFu8; 16]);
}

#[test]
fn upper_half_block_fills_the_top_eight_rows_only() {
    let g = glyph(0xDF);
    assert!(
        g[..8].iter().all(|&r| r == 0xFF),
        "top half should be solid"
    );
    assert!(
        g[8..].iter().all(|&r| r == 0x00),
        "bottom half should be empty"
    );
}

#[test]
fn lower_half_block_is_the_exact_complement_of_the_upper() {
    let up = glyph(0xDF);
    let down = glyph(0xDC);
    for i in 0..16 {
        assert_eq!(up[i] ^ down[i], 0xFF, "row {i} should be complementary");
    }
}

#[test]
fn glyph_mask_popcount_matches_the_bitmap() {
    assert_eq!(glyph_mask(0xDB).count_ones(), 128);
    assert_eq!(glyph_mask(0x20).count_ones(), 0);
    assert_eq!(glyph_mask(0xDF).count_ones(), 64);
}

#[test]
fn glyph_mask_puts_row_zero_in_the_high_bits() {
    // If this is inverted, every quantised image comes out vertically
    // mirrored and no other test would notice.
    let m = glyph_mask(0xDF);
    assert_eq!(m >> 64, u128::MAX >> 64, "top 64 bits should all be set");
    assert_eq!(m & (u128::MAX >> 64), 0, "bottom 64 bits should be clear");
}

#[test]
fn letters_are_actually_present_so_text_is_legible() {
    // A blank capital A means the PSF mapping failed and every screen
    // would render as spaces.
    assert!(glyph(b'A').iter().any(|&r| r != 0));
    assert!(glyph(b'z').iter().any(|&r| r != 0));
    assert!(glyph(b'0').iter().any(|&r| r != 0));
}

#[test]
fn candidate_set_contains_the_blocks_and_shades_and_is_not_the_whole_font() {
    for c in [0x20, 0xDB, 0xDF, 0xDC, 0xB0, 0xB1, 0xB2] {
        assert!(CANDIDATES.contains(&c), "{c:#04x} should be a candidate");
    }
    assert!(
        CANDIDATES.len() < 128,
        "a smaller set keeps the inner loop fast"
    );
}

#[test]
fn every_candidate_glyph_is_distinct() {
    // Two identical masks make one of them unreachable and waste a slot in
    // the inner loop.
    let mut masks: Vec<u128> = CANDIDATES.iter().map(|&c| glyph_mask(c)).collect();
    let before = masks.len();
    masks.sort_unstable();
    masks.dedup();
    assert_eq!(masks.len(), before, "candidate glyphs must all differ");
}

/// CP437 0x01-0x1F are SYMBOLS, not control codes.
///
/// The generator used Python's cp437 codec, which maps those bytes to the
/// actual control characters U+0000-U+001F, so every lookup missed and all
/// 31 came out blank. Nothing reported it: the generator's own
/// missing-glyph warning skipped everything under 0x20 as expected.
///
/// The board noticed in the obvious place - a menu hint drew `↑↓ move` as
/// `   move`, and the ► used as a lightbar pointer was invisible.
#[test]
fn the_glyphs_a_board_actually_needs_are_not_blank() {
    let font = bbs_core::font::FONT;
    let needed = [
        (0x10, "► the lightbar pointer"),
        (0x11, "◄"),
        (0x18, "↑"),
        (0x19, "↓"),
        (0x1A, "→"),
        (0x1B, "←"),
        (0x1E, "▲ scroll indicator"),
        (0x1F, "▼ scroll indicator"),
    ];
    for (code, what) in needed {
        let glyph = &font[code * 16..(code + 1) * 16];
        assert!(
            glyph.iter().any(|&r| r != 0),
            "byte {code:#04x} ({what}) is blank",
        );
    }
}

#[test]
fn a_blank_cell_stays_blank() {
    // 0x20 space and 0x00 must draw nothing, or every empty cell fills in.
    for code in [0x00usize, 0x20] {
        let glyph = &bbs_core::font::FONT[code * 16..(code + 1) * 16];
        assert!(
            glyph.iter().all(|&r| r == 0),
            "byte {code:#04x} is not blank"
        );
    }
}
