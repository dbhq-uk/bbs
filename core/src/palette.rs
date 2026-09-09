//! Choosing sixteen colours for one picture.
//!
//! WHY THIS IS PERIOD-CORRECT, because it looks like cheating and is not.
//!
//! The VGA DAC held six bits per channel - 262,144 colours - and could show
//! any sixteen of them at once. The fixed DOS palette was a default, not a
//! limit, and redefining it is what the DAC registers existed for. ACiD
//! built the XBIN format in 1996 precisely so a piece of art could carry
//! its own palette and font. Everything here would have run on a 1992 card.
//!
//! It is also the single largest quality lever available. Measured on a
//! portrait, sixteen colours chosen for the image beat doubling the cell
//! count with the DOS palette, and cost nothing in cells or bandwidth.
//!
//! The clustering runs in Oklab rather than sRGB. Distance in sRGB does not
//! match distance as an eye sees it, so a sRGB k-means spends entries on
//! greens nobody can distinguish and starves the skin tones that carry a
//! face.

use crate::colour::{linear_to_oklab, srgb_to_linear, Lab};

/// Snap to the VGA DAC's six bits per channel.
///
/// Without this the palette is a lie: it would describe colours the
/// hardware could not produce, and the claim that this is a period
/// technique would stop being true.
pub fn dac6(c: u8) -> u8 {
    let six = ((c as f32 / 255.0) * 63.0).round() as u8;
    ((six as f32 / 63.0) * 255.0).round() as u8
}

fn lab_of(rgb: (u8, u8, u8)) -> Lab {
    linear_to_oklab(
        srgb_to_linear(rgb.0),
        srgb_to_linear(rgb.1),
        srgb_to_linear(rgb.2),
    )
}

/// Sixteen colours chosen for this image, snapped to what the DAC can show.
///
/// Black is pinned to entry 0. Text-mode art leans on a true black for
/// background and for the space glyph, and k-means will happily drift the
/// darkest cluster to a murky grey that makes every unlit cell look like
/// fog.
pub fn choose(rgba: &[u8], w: u32, h: u32) -> [(u8, u8, u8); 16] {
    let mut samples: Vec<Lab> = Vec::new();
    let mut raw: Vec<(f32, f32, f32)> = Vec::new();

    // Sampling a grid rather than every pixel: the palette does not get
    // better past a few thousand samples and this runs on a caller's
    // machine, in a browser, on a phone.
    let step = (((w as usize * h as usize) / 4096).max(1) as f32)
        .sqrt()
        .ceil() as u32;
    for y in (0..h).step_by(step as usize) {
        for x in (0..w).step_by(step as usize) {
            let i = ((y * w + x) * 4) as usize;
            if i + 3 >= rgba.len() {
                continue;
            }
            // Transparent pixels are not colours; including them drags an
            // entry toward whatever the unused RGB under alpha 0 happens
            // to be, which is usually black or garbage.
            if rgba[i + 3] < 128 {
                continue;
            }
            let rgb = (rgba[i], rgba[i + 1], rgba[i + 2]);
            samples.push(lab_of(rgb));
            raw.push((rgb.0 as f32, rgb.1 as f32, rgb.2 as f32));
        }
    }

    if samples.is_empty() {
        return crate::screen::PALETTE;
    }

    let k = 16usize;
    // Deterministic seeding, spread across the sample set. A random start
    // would make the same image quantise differently between runs, which
    // makes snapshots and caching worthless.
    let mut centres: Vec<Lab> = (0..k).map(|i| samples[i * samples.len() / k]).collect();

    let mut owner = vec![0usize; samples.len()];
    for _ in 0..24 {
        let mut moved = false;
        for (s, sample) in samples.iter().enumerate() {
            let mut best = 0usize;
            let mut best_d = f32::MAX;
            for (c, centre) in centres.iter().enumerate() {
                let d = sample.dist2(*centre);
                if d < best_d {
                    best_d = d;
                    best = c;
                }
            }
            if owner[s] != best {
                owner[s] = best;
                moved = true;
            }
        }

        // Means are taken in sRGB, not Oklab: the palette entry has to be
        // an sRGB triple the DAC can hold, and averaging in Oklab then
        // converting back lands somewhere else.
        let mut sums = vec![(0.0f64, 0.0f64, 0.0f64, 0usize); k];
        for (s, &c) in owner.iter().enumerate() {
            sums[c].0 += raw[s].0 as f64;
            sums[c].1 += raw[s].1 as f64;
            sums[c].2 += raw[s].2 as f64;
            sums[c].3 += 1;
        }
        for (c, centre) in centres.iter_mut().enumerate() {
            if sums[c].3 > 0 {
                let n = sums[c].3 as f64;
                *centre = lab_of((
                    (sums[c].0 / n).round() as u8,
                    (sums[c].1 / n).round() as u8,
                    (sums[c].2 / n).round() as u8,
                ));
            }
        }
        if !moved {
            break;
        }
    }

    // Recover sRGB means for the final entries.
    let mut sums = vec![(0.0f64, 0.0f64, 0.0f64, 0usize); k];
    for (s, &c) in owner.iter().enumerate() {
        sums[c].0 += raw[s].0 as f64;
        sums[c].1 += raw[s].1 as f64;
        sums[c].2 += raw[s].2 as f64;
        sums[c].3 += 1;
    }

    let mut out = [(0u8, 0u8, 0u8); 16];
    for i in 0..k {
        out[i] = if sums[i].3 == 0 {
            (0, 0, 0)
        } else {
            let n = sums[i].3 as f64;
            (
                dac6((sums[i].0 / n).round().clamp(0.0, 255.0) as u8),
                dac6((sums[i].1 / n).round().clamp(0.0, 255.0) as u8),
                dac6((sums[i].2 / n).round().clamp(0.0, 255.0) as u8),
            )
        };
    }

    // Sort by lightness so entry 0 is darkest. Nothing depends on the
    // order, but a predictable ramp makes a dumped palette readable and
    // makes the black pin below meaningful.
    out.sort_by(|a, b| {
        let la = lab_of(*a).l;
        let lb = lab_of(*b).l;
        la.partial_cmp(&lb).unwrap_or(std::cmp::Ordering::Equal)
    });
    out[0] = (0, 0, 0);
    out
}
