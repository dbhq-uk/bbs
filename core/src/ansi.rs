use crate::screen::{Colour, Screen};

/// SGR codes for the 16 palette entries: 30-37 normal, 90-97 bright.
fn fg_code(c: Colour) -> u8 {
    let i = c as u8;
    if i < 8 {
        30 + i
    } else {
        90 + (i - 8)
    }
}

fn bg_code(c: Colour) -> u8 {
    let i = c as u8;
    if i < 8 {
        40 + i
    } else {
        100 + (i - 8)
    }
}

/// Encodes a screen as ANSI escape text.
///
/// Not used by the shell, which takes the cell grid directly. This exists
/// for snapshot tests - `cat` the snapshot and the picture appears in the
/// terminal, which is the only way to judge whether the quantiser is any
/// good - and for exporting a screen as a `.ans` file, the period-correct
/// artifact.
pub fn encode(s: &Screen) -> String {
    let mut out = String::new();
    for y in 0..s.h {
        let mut cur: Option<(Colour, Colour)> = None;
        for x in 0..s.w {
            let c = s.at(x, y);
            if cur != Some((c.fg, c.bg)) {
                out.push_str(&format!("\u{1b}[{};{}m", fg_code(c.fg), bg_code(c.bg)));
                cur = Some((c.fg, c.bg));
            }
            out.push(cp437_to_char(c.ch));
        }
        out.push_str("\u{1b}[0m\n");
    }
    out
}

/// CP437 byte to the Unicode character that looks the same.
pub fn cp437_to_char(b: u8) -> char {
    const HIGH: [char; 128] = [
        'Ç', 'ü', 'é', 'â', 'ä', 'à', 'å', 'ç', 'ê', 'ë', 'è', 'ï', 'î', 'ì', 'Ä', 'Å', 'É', 'æ',
        'Æ', 'ô', 'ö', 'ò', 'û', 'ù', 'ÿ', 'Ö', 'Ü', '¢', '£', '¥', '₧', 'ƒ', 'á', 'í', 'ó', 'ú',
        'ñ', 'Ñ', 'ª', 'º', '¿', '⌐', '¬', '½', '¼', '¡', '«', '»', '░', '▒', '▓', '│', '┤', '╡',
        '╢', '╖', '╕', '╣', '║', '╗', '╝', '╜', '╛', '┐', '└', '┴', '┬', '├', '─', '┼', '╞', '╟',
        '╚', '╔', '╩', '╦', '╠', '═', '╬', '╧', '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘',
        '┌', '█', '▄', '▌', '▐', '▀', 'α', 'ß', 'Γ', 'π', 'Σ', 'σ', 'µ', 'τ', 'Φ', 'Θ', 'Ω', 'δ',
        '∞', 'φ', 'ε', '∩', '≡', '±', '≥', '≤', '⌠', '⌡', '÷', '≈', '°', '∙', '·', '√', 'ⁿ', '²',
        '■', '\u{a0}',
    ];
    if b < 128 {
        b as char
    } else {
        HIGH[(b - 128) as usize]
    }
}
