//! Quantises a PNG to ANSI, for eyeballing art before it goes on the board.
//!
//!     cargo run --example quantise_png -- pic.png 40 [detail] [mono] > out.ans
use bbs_core::ansi;
use bbs_core::image::{quantise_with, Options};

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .expect("usage: quantise_png <file.png> [cols] [mono]");
    let cols: u16 = args.next().and_then(|s| s.parse().ok()).unwrap_or(40);
    let detail: f32 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1.2);
    let mono = args.next().is_some_and(|s| s == "mono");

    let file = std::fs::File::open(&path).expect("open");
    let mut reader = png::Decoder::new(file).read_info().expect("png");
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("frame");
    buf.truncate(info.buffer_size());
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf
            .chunks(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::Grayscale => buf.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        o => panic!("unsupported colour type {o:?}"),
    };

    let s = quantise_with(
        &rgba,
        info.width,
        info.height,
        Options {
            cols,
            max_rows: 200,
            monochrome: mono,
            detail,
            ..Options::default()
        },
    );
    eprintln!("{}x{}", s.w, s.h);
    print!("{}", ansi::encode(&s));
}
