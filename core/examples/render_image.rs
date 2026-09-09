//! Renders an .rgba file to ANSI on stdout so quantiser output can be
//! judged by eye. GLYPHS=all uses the whole font; the default is blocks.
use bbs_core::{
    ansi::encode,
    image::{quantise_with, GlyphSet, Options},
};

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let px = std::fs::read(&a[1]).unwrap();
    let (w, h) = a[2].split_once('x').unwrap();
    let cols: u16 = a.get(3).map(|s| s.parse().unwrap()).unwrap_or(60);
    let glyphs = match std::env::var("GLYPHS").as_deref() {
        Ok("all") => GlyphSet::All,
        Ok("box") => GlyphSet::Box,
        _ => GlyphSet::Blocks,
    };
    let s = quantise_with(
        &px,
        w.parse().unwrap(),
        h.parse().unwrap(),
        Options {
            cols,
            max_rows: 200,
            monochrome: false,
            glyphs,
            detail: std::env::var("DETAIL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1.2),
            ..Default::default()
        },
    );
    print!("{}", encode(&s));
}
