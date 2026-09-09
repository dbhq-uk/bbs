//! Choosing sixteen colours for one image.

use bbs_core::image::{quantise_full, Options, PaletteMode};
use bbs_core::palette::{choose, dac6};

fn gradient(w: u32, h: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            v.extend_from_slice(&[
                (x * 255 / w.max(1)) as u8,
                (y * 255 / h.max(1)) as u8,
                128,
                255,
            ]);
        }
    }
    v
}

#[test]
fn every_entry_is_reachable_by_the_vga_dac() {
    // The claim that a custom palette is period-correct rests entirely on
    // this: the DAC held six bits per channel, so an entry it cannot
    // produce would make the whole technique a modern one wearing a hat.
    for (r, g, b) in choose(&gradient(64, 64), 64, 64) {
        for c in [r, g, b] {
            assert_eq!(dac6(c), c, "{c} is not a 6-bit DAC value");
        }
    }
}

#[test]
fn dac6_snaps_to_the_six_bit_ladder() {
    assert_eq!(dac6(0), 0);
    assert_eq!(dac6(255), 255);
    for c in 0..=255u8 {
        assert_eq!(dac6(dac6(c)), dac6(c), "not idempotent at {c}");
    }
}

#[test]
fn entry_zero_is_black() {
    // Text mode leans on a true black for unlit cells and for the space
    // glyph. k-means will happily drift the darkest cluster to a murky
    // grey, and then every empty cell looks like fog.
    let p = choose(&gradient(32, 32), 32, 32);
    assert_eq!(p[0], (0, 0, 0));
}

#[test]
fn the_palette_is_deterministic() {
    // A random seed would make the same image quantise differently between
    // runs, which makes snapshots and any caching worthless.
    let px = gradient(48, 48);
    assert_eq!(choose(&px, 48, 48), choose(&px, 48, 48));
}

#[test]
fn a_transparent_image_does_not_panic() {
    let px = vec![0u8; 32 * 32 * 4]; // alpha 0 everywhere
    let _ = choose(&px, 32, 32);
}

#[test]
fn an_empty_image_falls_back_to_the_dos_palette() {
    assert_eq!(choose(&[], 0, 0), bbs_core::screen::PALETTE);
}

#[test]
fn auto_beats_dos_on_colours_dos_does_not_have() {
    // A picture made of mid browns is the case the DOS palette is worst
    // at: it holds one brown, and everything else is far away. This is a
    // measurement, not an opinion - the error is computed both ways.
    let (w, h) = (64u32, 64u32);
    let mut px = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let t = (x + y) as f32 / (w + h) as f32;
            px.extend_from_slice(&[
                (150.0 + 60.0 * t) as u8,
                (110.0 + 45.0 * t) as u8,
                (90.0 + 30.0 * t) as u8,
                255,
            ]);
        }
    }

    let err = |mode| {
        let q = quantise_full(
            &px,
            w,
            h,
            Options {
                cols: 16,
                max_rows: 40,
                detail: 0.0,
                palette: mode,
                ..Default::default()
            },
        );
        // Distance from each cell's chosen background to the true mean.
        let mut total = 0.0f64;
        for y in 0..q.screen.h {
            for x in 0..q.screen.w {
                let c = q.screen.at(x, y);
                let (r, g, b) = q.palette[c.bg as usize];
                total += ((r as f64 - 180.0).powi(2)
                    + (g as f64 - 132.0).powi(2)
                    + (b as f64 - 105.0).powi(2))
                .sqrt();
            }
        }
        total / (q.screen.w as f64 * q.screen.h as f64)
    };

    let dos = err(PaletteMode::Dos);
    let auto = err(PaletteMode::Auto);
    assert!(auto < dos, "auto {auto:.1} should beat dos {dos:.1}");
}

#[test]
fn a_fixed_palette_is_used_verbatim() {
    let mine = [(7u8, 7u8, 7u8); 16];
    let q = quantise_full(
        &gradient(16, 16),
        16,
        16,
        Options {
            cols: 4,
            palette: PaletteMode::Fixed(mine),
            ..Default::default()
        },
    );
    assert_eq!(q.palette, mine);
}

#[test]
fn dos_mode_returns_the_dos_palette() {
    let q = quantise_full(
        &gradient(16, 16),
        16,
        16,
        Options {
            cols: 4,
            ..Default::default()
        },
    );
    assert_eq!(q.palette, bbs_core::screen::PALETTE);
}

#[test]
fn halving_the_cell_height_doubles_the_rows() {
    // 8x8 is the 80x50 text mode: same picture, twice the vertical samples.
    let px = gradient(64, 64);
    let rows = |cell_h| {
        quantise_full(
            &px,
            64,
            64,
            Options {
                cols: 20,
                max_rows: 400,
                cell_h,
                ..Default::default()
            },
        )
        .screen
        .h
    };
    let tall = rows(16);
    let short = rows(8);
    assert!(
        (short as i32 - tall as i32 * 2).abs() <= 1,
        "8x8 gave {short} rows, 8x16 gave {tall}",
    );
}
