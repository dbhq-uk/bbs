//! Decoding `.ANS` art into a Screen.
//!
//! ansi.rs goes the other way - Screen to ANSI - which is what the board
//! needed while it was only ever drawing its own screens. Reading the art
//! scene's own files needs the inverse, and they are not symmetrical: art
//! files position the cursor, save and restore it, erase, and rely on
//! quirks of ANSI.SYS that a clean encoder never emits.
//!
//! Reference implementation: ENiGMA1/2's `core/ansi_escape_parser.js`
//! (BSD-2-Clause, NuSkooler). The behaviours worth knowing about were taken
//! from there; the code is written fresh against ANSI.SYS because a literal
//! port of an event-emitting terminal emulator would bring a great deal of
//! machinery this needs none of.
//!
//! WHY THIS MATTERS HERE: The ANSI Art Archive is on the board's own
//! curated site list, and until this existed the board could not display a
//! single file from it. A bulletin board that renders the web as ANSI and
//! cannot show ANSI art is a poor advertisement for itself.

use crate::screen::{Cell, Colour, Screen};

/// DOS end-of-file. Art files are routinely padded past it with junk, and
/// SAUCE lives after it, so decoding must stop here.
const SUB: u8 = 0x1A;

/// Art is drawn for an 80-column screen. Anything else and the escape
/// sequences that jump to a column land in the wrong place - the single
/// most common way ANSI art renders as garbage.
pub const ART_COLS: u16 = 80;

/// Rows grow as the art draws, but not without bound: a malformed or
/// hostile file can position the cursor arbitrarily far down.
const MAX_ROWS: u16 = 1000;

/// Strips the SAUCE record and anything past the DOS EOF marker.
///
/// SAUCE is a 128-byte trailer, optionally preceded by a comment block,
/// carrying title, author and group. Left in place it decodes as a screenful
/// of stray characters at the bottom of the art.
pub fn strip_sauce(bytes: &[u8]) -> &[u8] {
    let end = bytes.iter().position(|&b| b == SUB).unwrap_or(bytes.len());
    &bytes[..end]
}

/// Reads the SAUCE title, author and group, if present.
pub fn sauce(bytes: &[u8]) -> Option<Sauce> {
    if bytes.len() < 128 {
        return None;
    }
    let rec = &bytes[bytes.len() - 128..];
    if &rec[0..5] != b"SAUCE" {
        return None;
    }
    let field = |a: usize, b: usize| String::from_utf8_lossy(&rec[a..b]).trim_end().to_string();
    Some(Sauce {
        title: field(7, 42),
        author: field(42, 62),
        group: field(62, 82),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sauce {
    pub title: String,
    pub author: String,
    pub group: String,
}

struct State {
    x: u16,
    y: u16,
    fg: Colour,
    bg: Colour,
    bold: bool,
    saved: Option<(u16, u16)>,
}

impl State {
    fn cell(&self, ch: u8) -> Cell {
        // Bold is brightness, applied to the foreground only - the classic
        // 16-colour behaviour every one of these files was drawn against.
        let fg = if self.bold {
            Colour::from_index((self.fg as u8) | 8)
        } else {
            self.fg
        };
        Cell {
            ch,
            fg,
            bg: self.bg,
        }
    }
}

/// Decodes CP437 + ANSI escapes into a Screen.
pub fn decode(bytes: &[u8]) -> Screen {
    let body = strip_sauce(bytes);
    let mut rows: Vec<Vec<Cell>> = vec![vec![Cell::default(); ART_COLS as usize]];
    let mut s = State {
        x: 0,
        y: 0,
        fg: Colour::Grey,
        bg: Colour::Black,
        bold: false,
        saved: None,
    };

    let mut i = 0;
    while i < body.len() {
        let b = body[i];

        // CSI: ESC [ params letter
        if b == 0x1B && body.get(i + 1) == Some(&b'[') {
            let mut j = i + 2;
            while j < body.len() && !body[j].is_ascii_alphabetic() {
                j += 1;
            }
            if j >= body.len() {
                break;
            }
            let params = &body[i + 2..j];
            apply(&mut s, params, body[j], &mut rows);
            i = j + 1;
            continue;
        }

        match b {
            b'\n' => {
                s.y += 1;
                s.x = 0;
            }
            b'\r' => s.x = 0,
            0x1B => {} // A lone escape with no CSI; skip it.
            _ => {
                // Art relies on the wrap: a full 80-column row followed by
                // more bytes continues on the next line with no newline.
                if s.x >= ART_COLS {
                    s.x = 0;
                    s.y += 1;
                }
                if s.y < MAX_ROWS {
                    grow(&mut rows, s.y);
                    rows[s.y as usize][s.x as usize] = s.cell(b);
                }
                s.x += 1;
            }
        }
        i += 1;
    }

    let h = rows.len().min(MAX_ROWS as usize) as u16;
    let mut screen = Screen::new(ART_COLS, h);
    for (y, row) in rows.iter().take(h as usize).enumerate() {
        for (x, &c) in row.iter().enumerate() {
            screen.set(x as u16, y as u16, c);
        }
    }
    screen
}

fn grow(rows: &mut Vec<Vec<Cell>>, y: u16) {
    while rows.len() <= y as usize {
        rows.push(vec![Cell::default(); ART_COLS as usize]);
    }
}

fn nums(params: &[u8]) -> Vec<u16> {
    String::from_utf8_lossy(params)
        .split(';')
        .map(|p| p.trim().parse::<u16>().unwrap_or(0))
        .collect()
}

fn apply(s: &mut State, params: &[u8], cmd: u8, rows: &mut Vec<Vec<Cell>>) {
    let n = nums(params);
    let first = n.first().copied().unwrap_or(0);
    // Movement commands treat a missing or zero parameter as 1.
    let count = first.max(1);

    match cmd {
        b'm' => {
            // SGR codes map straight onto the palette, which is worth
            // stating because it is NOT what the hardware did. VGA text
            // attributes are IRGB, so on real hardware blue is 1 and red is
            // 4. This palette is in ANSI order instead - index 1 IS red -
            // which ansi.rs depends on when it encodes as `30 + index`. So
            // decoding is `code - 30` with no remap.
            //
            // A remap was written here first, on the IRGB assumption, and it
            // swapped red and blue across every piece of art while still
            // looking like a plausible BBS logo. Only the tests caught it.
            for &code in &n {
                match code {
                    0 => {
                        s.fg = Colour::Grey;
                        s.bg = Colour::Black;
                        s.bold = false;
                    }
                    1 => s.bold = true,
                    // Blink. Real hardware blinked; here it would only ever
                    // be a distraction, so it is deliberately ignored rather
                    // than mapped to bright background, which would change
                    // the artist's colours.
                    5 => {}
                    22 => s.bold = false,
                    30..=37 => s.fg = Colour::from_index((code - 30) as u8),
                    40..=47 => s.bg = Colour::from_index((code - 40) as u8),
                    90..=97 => s.fg = Colour::from_index((code - 90) as u8 | 8),
                    100..=107 => s.bg = Colour::from_index((code - 100) as u8 | 8),
                    _ => {}
                }
            }
        }
        b'A' => s.y = s.y.saturating_sub(count),
        b'B' => s.y = (s.y + count).min(MAX_ROWS - 1),
        b'C' => s.x = (s.x + count).min(ART_COLS - 1),
        b'D' => s.x = s.x.saturating_sub(count),
        b'H' | b'f' => {
            // 1-based in the sequence, 0-based here.
            s.y = n.first().copied().unwrap_or(1).max(1) - 1;
            s.x = n.get(1).copied().unwrap_or(1).max(1) - 1;
            s.x = s.x.min(ART_COLS - 1);
            s.y = s.y.min(MAX_ROWS - 1);
        }
        b's' => s.saved = Some((s.x, s.y)),
        b'u' => {
            if let Some((x, y)) = s.saved {
                s.x = x;
                s.y = y;
            }
        }
        b'J' => {
            // 2 clears the whole screen. Art uses this as a preamble far
            // more often than it uses the partial forms.
            if first == 2 {
                for row in rows.iter_mut() {
                    row.fill(Cell::default());
                }
                s.x = 0;
                s.y = 0;
            }
        }
        b'K' => {
            grow(rows, s.y);
            let row = &mut rows[s.y as usize];
            let len = row.len();
            let x = (s.x as usize).min(len);
            match first {
                1 => row[..x.min(len.saturating_sub(1)) + 1].fill(Cell::default()),
                2 => row.fill(Cell::default()),
                _ => row[x..].fill(Cell::default()),
            }
        }
        _ => {}
    }
}
