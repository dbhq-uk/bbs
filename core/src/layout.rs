use crate::doc::{Block, SemanticDoc};
use crate::screen::{Colour, Screen};

/// Converts a Rust string to CP437 bytes.
///
/// The web is full of smart quotes, em dashes and ellipses. Dropping them
/// silently makes real text look corrupted, so the common ones fold to their
/// ASCII equivalents and the Latin-1 range maps to its CP437 slot.
pub fn to_cp437(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{2032}' => out.push(b'\''),
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{2033}' => out.push(b'"'),
            '\u{2013}' | '\u{2014}' | '\u{2212}' => out.push(b'-'),
            '\u{2026}' => out.extend_from_slice(b"..."),
            '\u{00A0}' | '\u{2009}' | '\u{200A}' | '\u{202F}' => out.push(b' '),
            '\u{2022}' | '\u{00B7}' => out.push(0xF9),
            '\u{2122}' => out.extend_from_slice(b"(TM)"),
            '\u{00A9}' => out.extend_from_slice(b"(C)"),
            '\u{00AE}' => out.extend_from_slice(b"(R)"),
            c if (c as u32) < 128 => out.push(c as u8),
            // The high CP437 range - box drawing, blocks, shades, Greek,
            // maths - is the exact inverse of the table ansi.rs uses to
            // print a screen, so derive it from there rather than
            // maintaining a second list that can drift.
            c => out.push(
                latin1_to_cp437(c)
                    .or_else(|| high_cp437(c))
                    .unwrap_or(b'?'),
            ),
        }
    }
    out
}

/// Unicode to CP437 for the 0x80..=0xFF range, inverted from
/// `ansi::cp437_to_char` so the two can never disagree.
fn high_cp437(c: char) -> Option<u8> {
    (128u8..=255).find(|&b| crate::ansi::cp437_to_char(b) == c)
}

/// The accented characters that actually turn up in European web copy.
fn latin1_to_cp437(c: char) -> Option<u8> {
    Some(match c {
        'ç' => 0x87,
        'ü' => 0x81,
        'é' => 0x82,
        'â' => 0x83,
        'ä' => 0x84,
        'à' => 0x85,
        'å' => 0x86,
        'ê' => 0x88,
        'ë' => 0x89,
        'è' => 0x8A,
        'ï' => 0x8B,
        'î' => 0x8C,
        'ì' => 0x8D,
        'Ä' => 0x8E,
        'Å' => 0x8F,
        'É' => 0x90,
        'æ' => 0x91,
        'Æ' => 0x92,
        'ô' => 0x93,
        'ö' => 0x94,
        'ò' => 0x95,
        'û' => 0x96,
        'ù' => 0x97,
        'ÿ' => 0x98,
        'Ö' => 0x99,
        'Ü' => 0x9A,
        '£' => 0x9C,
        'ñ' => 0xA4,
        'Ñ' => 0xA5,
        'º' => 0xA7,
        'ß' => 0xE1,
        '°' => 0xF8,
        '±' => 0xF1,
        '÷' => 0xF6,
        _ => return None,
    })
}

struct Painter {
    cols: u16,
    rows: u16,
    pages: Vec<Screen>,
    y: u16,
}

impl Painter {
    fn new(cols: u16, rows: u16) -> Self {
        Painter {
            cols,
            rows,
            pages: vec![Screen::new(cols, rows)],
            y: 0,
        }
    }

    fn newpage(&mut self) {
        self.pages.push(Screen::new(self.cols, self.rows));
        self.y = 0;
    }

    fn line(&mut self, text: &[u8], fg: Colour) {
        if self.y >= self.rows {
            self.newpage();
        }
        let page = self.pages.last_mut().unwrap();
        page.write(0, self.y, text, fg, Colour::Black);
        self.y += 1;
    }

    fn blank(&mut self) {
        // Never start a page with a blank line.
        if self.y > 0 && self.y < self.rows {
            self.y += 1;
        }
    }

    /// Greedy word wrap over CP437 bytes. Words longer than the line get
    /// hard-split, because a 200-character URL must not silently vanish.
    ///
    /// This works on `Vec<u8>` end to end and never reconstructs a `String`.
    /// Converting to CP437 and back through `from_utf8_lossy` turns every
    /// byte above 0x7F into U+FFFD, so all the accented text, bullets and
    /// box-drawing characters just carefully mapped would arrive on screen
    /// as replacement characters.
    fn wrapped(&mut self, text: &str, fg: Colour, indent: usize) {
        let indent = indent.min(self.cols.saturating_sub(8) as usize);
        let width = (self.cols as usize).saturating_sub(indent).max(1);
        let bytes = to_cp437(text);

        let mut line: Vec<u8> = Vec::with_capacity(width);
        for word in bytes.split(|&b| b == b' ') {
            if word.is_empty() {
                continue;
            }
            if line.is_empty() {
                line.extend_from_slice(word);
            } else if line.len() + 1 + word.len() <= width {
                line.push(b' ');
                line.extend_from_slice(word);
            } else {
                self.indented(&line, fg, indent);
                line.clear();
                line.extend_from_slice(word);
            }
            while line.len() > width {
                let tail = line.split_off(width);
                self.indented(&line, fg, indent);
                line = tail;
            }
        }
        if !line.is_empty() {
            self.indented(&line, fg, indent);
        }
    }

    fn indented(&mut self, chunk: &[u8], fg: Colour, indent: usize) {
        let mut out = vec![b' '; indent];
        out.extend_from_slice(chunk);
        self.line(&out, fg);
    }
}

pub fn render(doc: &SemanticDoc, cols: u16, rows: u16) -> Vec<Screen> {
    let mut p = Painter::new(cols, rows);

    for block in &doc.blocks {
        match block {
            Block::Heading { level, text } => {
                p.blank();
                let fg = match level {
                    1 => Colour::BrightYellow,
                    2 => Colour::BrightCyan,
                    _ => Colour::BrightGreen,
                };
                p.wrapped(text, fg, 0);
                if *level == 1 {
                    let n = (cols as usize).min(text.chars().count().max(4));
                    p.line(&vec![0xC4u8; n], Colour::DarkGrey);
                }
                p.blank();
            }
            Block::Paragraph { text } => {
                p.wrapped(text, Colour::Grey, 0);
                p.blank();
            }
            Block::Quote { text } => {
                p.wrapped(text, Colour::Cyan, 2);
                p.blank();
            }
            Block::Link { text, index, .. } => {
                let label = format!("[{index:2}] {text}");
                p.wrapped(&label, Colour::BrightBlue, 0);
            }
            Block::List { items, ordered } => {
                for (i, item) in items.iter().enumerate() {
                    let bullet = if *ordered {
                        format!("{}. {}", i + 1, item)
                    } else {
                        // U+2022, which to_cp437 maps to 0xF9. Writing
                        // "\u{f9}" here would be U+00F9 (u-grave) and would
                        // come out as "?" - the escape is a Unicode code
                        // point, not a CP437 byte.
                        format!("\u{2022} {item}")
                    };
                    p.wrapped(&bullet, Colour::Grey, 2);
                }
                p.blank();
            }
            Block::Image { alt, index, .. } => {
                let label = if alt.is_empty() {
                    format!("<{index}> [IMAGE]")
                } else {
                    format!("<{index}> [IMAGE: {alt}]")
                };
                p.wrapped(&label, Colour::BrightMagenta, 0);
            }
            Block::Table {
                headers,
                rows: trows,
            } => {
                if !headers.is_empty() {
                    p.wrapped(&headers.join(" | "), Colour::BrightCyan, 0);
                }
                for r in trows {
                    p.wrapped(&r.join(" | "), Colour::Grey, 0);
                }
                p.blank();
            }
            Block::Rule => {
                p.line(&vec![0xC4u8; cols as usize], Colour::DarkGrey);
            }
        }
    }
    p.pages
}
