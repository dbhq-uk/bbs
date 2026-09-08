use serde::{Deserialize, Serialize};

/// The 16-colour ANSI palette, which is what a board actually had.
/// Index order is the standard IRGB order: the low 8 are normal, the high 8
/// are bright.
///
/// `serde(into/from = "u8")` is load-bearing, not decoration. A plain derive
/// on a fieldless enum serialises the VARIANT NAME - the shell would receive
/// `"Grey"` and index PALETTE_CSS with a string, drawing nothing and raising
/// no error. `#[repr(u8)]` does not change that; serde ignores it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "u8", from = "u8")]
#[repr(u8)]
pub enum Colour {
    Black = 0,
    Red = 1,
    Green = 2,
    Yellow = 3,
    Blue = 4,
    Magenta = 5,
    Cyan = 6,
    Grey = 7,
    DarkGrey = 8,
    BrightRed = 9,
    BrightGreen = 10,
    BrightYellow = 11,
    BrightBlue = 12,
    BrightMagenta = 13,
    BrightCyan = 14,
    White = 15,
}

impl Colour {
    /// Total over 0..=15. No transmute: a match compiles to the same thing
    /// and cannot produce an invalid discriminant if the enum is reordered.
    pub fn from_index(i: u8) -> Colour {
        match i & 0x0F {
            0 => Colour::Black,
            1 => Colour::Red,
            2 => Colour::Green,
            3 => Colour::Yellow,
            4 => Colour::Blue,
            5 => Colour::Magenta,
            6 => Colour::Cyan,
            7 => Colour::Grey,
            8 => Colour::DarkGrey,
            9 => Colour::BrightRed,
            10 => Colour::BrightGreen,
            11 => Colour::BrightYellow,
            12 => Colour::BrightBlue,
            13 => Colour::BrightMagenta,
            14 => Colour::BrightCyan,
            _ => Colour::White,
        }
    }
}

impl From<Colour> for u8 {
    fn from(c: Colour) -> u8 {
        c as u8
    }
}

impl From<u8> for Colour {
    fn from(i: u8) -> Colour {
        Colour::from_index(i)
    }
}

/// RGB values for each palette entry. The standard VGA values, not a modern
/// terminal's reinterpretation of them.
pub const PALETTE: [(u8, u8, u8); 16] = [
    (0, 0, 0),
    (170, 0, 0),
    (0, 170, 0),
    (170, 85, 0),
    (0, 0, 170),
    (170, 0, 170),
    (0, 170, 170),
    (170, 170, 170),
    (85, 85, 85),
    (255, 85, 85),
    (85, 255, 85),
    (255, 255, 85),
    (85, 85, 255),
    (255, 85, 255),
    (85, 255, 255),
    (255, 255, 255),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cell {
    /// CP437 code point, not Unicode.
    pub ch: u8,
    pub fg: Colour,
    pub bg: Colour,
}

impl Default for Cell {
    fn default() -> Self {
        Cell {
            ch: b' ',
            fg: Colour::Grey,
            bg: Colour::Black,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screen {
    pub w: u16,
    pub h: u16,
    pub cells: Vec<Cell>,
}

impl Screen {
    pub fn new(w: u16, h: u16) -> Self {
        Screen {
            w,
            h,
            cells: vec![Cell::default(); (w as usize) * (h as usize)],
        }
    }

    pub fn at(&self, x: u16, y: u16) -> Cell {
        self.cells[(y as usize) * (self.w as usize) + (x as usize)]
    }

    pub fn set(&mut self, x: u16, y: u16, c: Cell) {
        if x < self.w && y < self.h {
            let i = (y as usize) * (self.w as usize) + (x as usize);
            self.cells[i] = c;
        }
    }

    /// Writes CP437 bytes left to right. Does not wrap; callers do layout.
    pub fn write(&mut self, x: u16, y: u16, s: &[u8], fg: Colour, bg: Colour) {
        for (i, &ch) in s.iter().enumerate() {
            self.set(x + i as u16, y, Cell { ch, fg, bg });
        }
    }
}
