//! Plain ASCII art, by luminance ramp.
//!
//! WHY THIS IS NOT THE GLYPH QUANTISER.
//!
//! image.rs chooses a character by SHAPE: it scores every candidate glyph's
//! bitmap against the pixels behind the cell and picks the best
//! reconstruction. That is right for block and shade glyphs, whose shapes
//! are the point, and it is wrong for letters. Given the alphabet it
//! produces a ransom note - `q`, `M` and `#` scattered by whichever
//! happened to match a noisy 8x16 patch - which is unreadable as a picture
//! however good the arithmetic is. That was tried; the output is in the
//! commit history.
//!
//! Everyone who asks for "ASCII art" means the other thing: an ordered
//! ramp from dark to light, one character per cell, chosen on brightness
//! alone. Shape is deliberately ignored, and that is what makes the picture
//! legible, because the eye reads the density field rather than the glyphs.
//!
//! Output is plain text with no escape codes, so it pastes into a README, a
//! signature, a commit message or a terminal.

use crate::colour::srgb_to_linear;

/// Dark to light. The classic long ramp, which gives ten usable steps on a
/// dark background and reads well at small sizes.
pub const RAMP: &str = " .:-=+*#%@";

/// A denser ramp for larger renders, where more steps are distinguishable.
pub const RAMP_FINE: &str =
    " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

/// Character cells are about twice as tall as they are wide, so a square
/// image sampled one cell per square would come out twice as tall as it
/// should. Same correction the glyph quantiser makes.
const CELL_ASPECT: f32 = 0.5;

/// Renders to plain text.
///
/// `invert` swaps the ramp, for dark text on a light background - which is
/// what a README on a white page needs, and the opposite of a terminal.
pub fn render(rgba: &[u8], w: u32, h: u32, cols: u16, ramp: &str, invert: bool) -> String {
    if w == 0 || h == 0 || cols == 0 {
        return String::new();
    }
    let chars: Vec<char> = ramp.chars().collect();
    if chars.is_empty() {
        return String::new();
    }

    let cols = cols as u32;
    let rows = (((h as f32 / w as f32) * cols as f32 * CELL_ASPECT).round() as u32).max(1);

    let mut out = String::with_capacity(((cols + 1) * rows) as usize);
    for row in 0..rows {
        for col in 0..cols {
            // Box-filter the source region behind this cell. Point sampling
            // a large photograph through a small grid throws most of it away
            // and aliases badly.
            let x0 = (col * w / cols).min(w - 1);
            let x1 = (((col + 1) * w).div_ceil(cols)).clamp(x0 + 1, w);
            let y0 = (row * h / rows).min(h - 1);
            let y1 = (((row + 1) * h).div_ceil(rows)).clamp(y0 + 1, h);

            let mut sum = 0.0f32;
            let mut n = 0u32;
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * w + x) * 4) as usize;
                    if i + 3 >= rgba.len() {
                        continue;
                    }
                    // Averaged in LINEAR light and composited over black.
                    // Averaging gamma-encoded values makes every midtone
                    // too dark, which shows up as a picture that is all
                    // shadow with a few highlights.
                    let a = rgba[i + 3] as f32 / 255.0;
                    let lum = 0.2126 * srgb_to_linear(rgba[i])
                        + 0.7152 * srgb_to_linear(rgba[i + 1])
                        + 0.0722 * srgb_to_linear(rgba[i + 2]);
                    sum += lum * a;
                    n += 1;
                }
            }
            let mean = if n == 0 { 0.0 } else { sum / n as f32 };
            // Back to a perceptual scale before indexing the ramp. Indexing
            // on linear luminance spends most of the ramp on highlights and
            // crushes everything else into the first two characters.
            let v = mean.clamp(0.0, 1.0).powf(1.0 / 2.2);
            let t = if invert { 1.0 - v } else { v };
            let idx = ((t * (chars.len() - 1) as f32).round() as usize).min(chars.len() - 1);
            out.push(chars[idx]);
        }
        out.push('\n');
    }
    out
}
