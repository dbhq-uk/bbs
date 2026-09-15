//! Quantises a PNG to ANSI, for eyeballing art before it goes on the board.
//!
//!     cargo run --example quantise_png -- pic.png [cols] [detail] [mono] \
//!         [--auto-palette] [--cell-h 8]
//!
//! With --auto-palette the sixteen colours are chosen for the image, so the
//! ANSI on stdout is meaningless without them: the palette is written to
//! stderr as `PALETTE rrggbb ...` for ansi2png.py to pick up.
use bbs_core::ansi;
use bbs_core::image::{quantise_full, GlyphSet, Options, PaletteMode};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let positional: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
    let flag = |n: &str| args.iter().any(|a| a == n);
    let sval = |n: &str| {
        args.iter()
            .position(|a| a == n)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let value = |n: &str| {
        args.iter()
            .position(|a| a == n)
            .and_then(|i| args.get(i + 1))
            .and_then(|v| v.parse::<u32>().ok())
    };

    let path = positional
        .first()
        .expect("usage: quantise_png <file.png> ...");
    let cols: u16 = positional.get(1).and_then(|s| s.parse().ok()).unwrap_or(40);
    let detail: f32 = positional
        .get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(1.2);
    let mono = positional.get(3).is_some_and(|s| s.as_str() == "mono");

    let file = std::fs::File::open(path.as_str()).expect("open");
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

    let q = quantise_full(
        &rgba,
        info.width,
        info.height,
        Options {
            cols,
            max_rows: 400,
            monochrome: mono,
            detail,
            cell_h: value("--cell-h").unwrap_or(16),
            art_font: flag("--art"),
            glyphs: match sval("--glyphs").as_deref() {
                Some("ascii") => GlyphSet::Ascii,
                Some("box") => GlyphSet::Box,
                Some("art") => GlyphSet::Art,
                Some("all") => GlyphSet::All,
                _ if flag("--art") => GlyphSet::Art,
                _ => GlyphSet::Blocks,
            },
            palette: if flag("--auto-palette") {
                PaletteMode::Auto
            } else {
                PaletteMode::Dos
            },
        },
    );

    eprintln!("{}x{}", q.screen.w, q.screen.h);
    eprint!("PALETTE");
    for (r, g, b) in q.palette {
        eprint!(" {r:02x}{g:02x}{b:02x}");
    }
    eprintln!();
    print!("{}", ansi::encode(&q.screen));
}
