//! Colour maths for the quantiser.
//!
//! Two things here matter and both were wrong in the first implementation.
//!
//! **Linear light.** Averaging gamma-encoded sRGB darkens and shifts every
//! mixture. Downsampling and blending both have to happen in linear light.
//!
//! **Perceptual distance.** Nearest-neighbour in sRGB sends desaturated
//! mid-tones to saturated palette entries, because Euclidean RGB distance
//! is not perceptual and the 16-colour palette has only four neutrals. On a
//! real photograph that turned a neutral grey background bright cyan. Oklab
//! fixes it; chafa reaches for DIN99d for exactly the same reason.

use crate::screen::PALETTE;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lab {
    pub l: f32,
    pub a: f32,
    pub b: f32,
}

impl Lab {
    pub fn dist2(self, o: Lab) -> f32 {
        let dl = self.l - o.l;
        let da = self.a - o.a;
        let db = self.b - o.b;
        dl * dl + da * da + db * db
    }
}

/// sRGB byte to linear light, 0..=1.
pub fn srgb_to_linear(c: u8) -> f32 {
    let c = c as f32 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Linear light to Oklab. Björn Ottosson's published matrices.
pub fn linear_to_oklab(r: f32, g: f32, b: f32) -> Lab {
    let l = 0.412_221_47 * r + 0.536_332_55 * g + 0.051_445_995 * b;
    let m = 0.211_903_5 * r + 0.680_699_5 * g + 0.107_396_96 * b;
    let s = 0.088_302_46 * r + 0.281_718_85 * g + 0.629_978_5 * b;

    let l_ = l.cbrt();
    let m_ = m.cbrt();
    let s_ = s.cbrt();

    Lab {
        l: 0.210_454_26 * l_ + 0.793_617_8 * m_ - 0.004_072_047 * s_,
        a: 1.977_998_5 * l_ - 2.428_592_2 * m_ + 0.450_593_7 * s_,
        b: 0.025_904_037 * l_ + 0.782_771_77 * m_ - 0.808_675_77 * s_,
    }
}

/// The palette in linear light, for blending.
pub fn palette_linear() -> [(f32, f32, f32); 16] {
    let mut out = [(0.0, 0.0, 0.0); 16];
    for (i, &(r, g, b)) in PALETTE.iter().enumerate() {
        out[i] = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b));
    }
    out
}

/// The palette in Oklab, for distance.
pub fn palette_oklab() -> [Lab; 16] {
    let lin = palette_linear();
    let mut out = [Lab {
        l: 0.0,
        a: 0.0,
        b: 0.0,
    }; 16];
    for i in 0..16 {
        out[i] = linear_to_oklab(lin[i].0, lin[i].1, lin[i].2);
    }
    out
}
