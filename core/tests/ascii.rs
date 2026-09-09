//! Plain ASCII art by luminance ramp.

use bbs_core::ascii::{render, RAMP, RAMP_FINE};

fn flat(w: u32, h: u32, v: u8) -> Vec<u8> {
    (0..w * h).flat_map(|_| [v, v, v, 255]).collect()
}

fn lines(s: &str) -> Vec<&str> {
    s.lines().collect()
}

#[test]
fn black_is_the_first_rung_and_white_the_last() {
    let dark = render(&flat(16, 16, 0), 16, 16, 8, RAMP, false);
    let light = render(&flat(16, 16, 255), 16, 16, 8, RAMP, false);
    assert!(dark.starts_with(' '), "black should be the blank rung");
    assert!(light.starts_with('@'), "white should be the densest rung");
}

#[test]
fn invert_swaps_the_ends() {
    let light = render(&flat(16, 16, 255), 16, 16, 8, RAMP, true);
    assert!(light.starts_with(' '), "inverted white should be blank");
}

#[test]
fn cells_are_twice_as_tall_as_wide() {
    // A square image sampled one cell per square would come out twice as
    // tall as it should, because a character cell is not square.
    let out = render(&flat(64, 64, 128), 64, 64, 40, RAMP, false);
    let rows = lines(&out).len();
    assert!(
        (rows as i32 - 20).abs() <= 1,
        "square image gave {rows} rows for 40 cols"
    );
}

#[test]
fn every_row_is_the_requested_width() {
    let out = render(&flat(40, 30, 90), 40, 30, 33, RAMP, false);
    for (i, l) in lines(&out).iter().enumerate() {
        assert_eq!(l.chars().count(), 33, "row {i}");
    }
}

#[test]
fn a_gradient_uses_most_of_the_ramp() {
    // The real failure mode is indexing on LINEAR luminance, which crushes
    // everything into the first two characters and leaves the picture
    // black. A left-to-right ramp should reach most rungs.
    let (w, h) = (200u32, 20u32);
    let mut px = Vec::new();
    for _ in 0..h {
        for x in 0..w {
            let v = (x * 255 / (w - 1)) as u8;
            px.extend_from_slice(&[v, v, v, 255]);
        }
    }
    let out = render(&px, w, h, 60, RAMP, false);
    let used: std::collections::HashSet<char> = out.chars().filter(|c| *c != '\n').collect();
    assert!(
        used.len() >= 8,
        "only {} of 10 rungs used: {:?}",
        used.len(),
        used
    );
}

#[test]
fn the_fine_ramp_gives_more_steps_than_the_short_one() {
    let (w, h) = (200u32, 20u32);
    let mut px = Vec::new();
    for _ in 0..h {
        for x in 0..w {
            let v = (x * 255 / (w - 1)) as u8;
            px.extend_from_slice(&[v, v, v, 255]);
        }
    }
    let count = |ramp: &str| {
        render(&px, w, h, 120, ramp, false)
            .chars()
            .filter(|c| *c != '\n')
            .collect::<std::collections::HashSet<char>>()
            .len()
    };
    assert!(count(RAMP_FINE) > count(RAMP));
}

#[test]
fn output_is_plain_text_with_no_escape_codes() {
    // The whole point is that it pastes anywhere.
    let out = render(&flat(32, 32, 200), 32, 32, 20, RAMP, false);
    assert!(!out.contains('\x1b'));
    assert!(out.chars().all(|c| c == '\n' || (' '..='~').contains(&c)));
}

#[test]
fn degenerate_input_does_not_panic() {
    assert_eq!(render(&[], 0, 0, 40, RAMP, false), "");
    assert_eq!(render(&flat(4, 4, 0), 4, 4, 0, RAMP, false), "");
    assert_eq!(render(&flat(4, 4, 0), 4, 4, 10, "", false), "");
    // Fewer pixels than cells: every cell must still get a character.
    let out = render(&flat(2, 2, 255), 2, 2, 40, RAMP, false);
    assert_eq!(lines(&out)[0].chars().count(), 40);
}

#[test]
fn transparent_pixels_read_as_background() {
    // Composited over black, so a transparent PNG does not come back as a
    // solid block of whatever was under the alpha.
    let px: Vec<u8> = (0..256).flat_map(|_| [255u8, 255, 255, 0]).collect();
    let out = render(&px, 16, 16, 8, RAMP, false);
    assert!(out.starts_with(' '));
}
