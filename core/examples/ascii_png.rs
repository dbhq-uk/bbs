//! Plain ASCII art from a PNG, for eyeballing the ramp.
//!
//!     cargo run --example ascii_png -- pic.png 100 [fine] [invert]
use bbs_core::ascii;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let path = a
        .first()
        .expect("usage: ascii_png <file.png> [cols] [fine] [invert]");
    let cols: u16 = a.get(1).and_then(|s| s.parse().ok()).unwrap_or(100);
    let fine = a.iter().any(|s| s == "fine");
    let invert = a.iter().any(|s| s == "invert");

    let f = std::fs::File::open(path).expect("open");
    let mut r = png::Decoder::new(f).read_info().expect("png");
    let mut buf = vec![0; r.output_buffer_size()];
    let info = r.next_frame(&mut buf).expect("frame");
    buf.truncate(info.buffer_size());
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf
            .chunks(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::Grayscale => buf.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        o => panic!("unsupported {o:?}"),
    };
    let ramp = if fine { ascii::RAMP_FINE } else { ascii::RAMP };
    print!(
        "{}",
        ascii::render(&rgba, info.width, info.height, cols, ramp, invert)
    );
}
