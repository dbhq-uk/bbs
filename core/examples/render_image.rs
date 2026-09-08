//! Renders an .rgba file to ANSI on stdout, so quantiser output can be
//! judged by eye. Usage: cargo run --example render_image -- file.rgba WxH
use bbs_core::{ansi::encode, image::quantise};

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let px = std::fs::read(&a[1]).unwrap();
    let (w, h) = a[2].split_once('x').unwrap();
    let s = quantise(&px, w.parse().unwrap(), h.parse().unwrap(), 60, 40);
    print!("{}", encode(&s));
}
