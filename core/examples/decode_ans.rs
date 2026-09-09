//! Decodes a .ANS file and re-encodes it, so a piece of art can be eyeballed.
//!
//!     cargo run --example decode_ans -- piece.ans > out.ans
//!
//! Scene art is copyright its artists, so none is committed here. This
//! exists to point at a file you have fetched yourself.
use bbs_core::{ansi, ansi_art};

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: decode_ans <file.ans>");
    let bytes = std::fs::read(&path).expect("read");
    if let Some(s) = ansi_art::sauce(&bytes) {
        eprintln!("SAUCE: {:?} by {:?} / {:?}", s.title, s.author, s.group);
    }
    let screen = ansi_art::decode(&bytes);
    eprintln!("{}x{}", screen.w, screen.h);
    print!("{}", ansi::encode(&screen));
}
