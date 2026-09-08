//! `bbs` core: semantic projection, layout and CP437 quantisation.
//!
//! No network, no DOM, no browser API. Everything here is a pure function
//! over data the shell hands it, which is what makes it testable on the
//! host and portable to a native build later.

use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod ansi;
pub mod chrome;
pub mod colour;
pub mod doc;
pub mod font;
pub mod image;
pub mod layout;
pub mod name;
pub mod project;
pub mod raw;
pub mod role;
pub mod screen;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// The shell builds its glyph atlas from these exact bytes, so what the
/// quantiser matched is what the reader sees.
#[wasm_bindgen]
pub fn font_bytes() -> Vec<u8> {
    font::FONT.to_vec()
}

#[derive(Serialize)]
struct DocumentResult {
    title: String,
    pages: Vec<screen::Screen>,
    links: Vec<LinkTarget>,
    images: Vec<ImageTarget>,
    empty_shell: bool,
    blocks_in: usize,
    blocks_out: usize,
    /// How many blocks precede the first paragraph. The corpus's "how much
    /// chrome before the first useful line" measurement, exported here
    /// because nothing downstream can recover it from a finished grid.
    blocks_before_first_prose: usize,
    /// Images a reader would fetch to see the page as intended. Used to set
    /// the gateway's request allowance from real data.
    image_count: usize,
}

#[derive(Serialize)]
struct LinkTarget {
    index: usize,
    href: String,
}

#[derive(Serialize)]
struct ImageTarget {
    index: usize,
    src: String,
    alt: String,
}

/// Full pipeline: serialised DOM in, paged screens out.
#[wasm_bindgen]
pub fn render_document(raw_json: &str, cols: u16, rows: u16) -> Result<JsValue, JsValue> {
    let raw: raw::RawNode = serde_json::from_str(raw_json)
        .map_err(|e| JsValue::from_str(&format!("bad RawNode json: {e}")))?;

    let (document, stats) = project::project_and_clean(&raw);

    let links = document
        .blocks
        .iter()
        .filter_map(|b| match b {
            doc::Block::Link { index, href, .. } => Some(LinkTarget {
                index: *index,
                href: href.clone(),
            }),
            _ => None,
        })
        .collect();

    let images: Vec<ImageTarget> = document
        .blocks
        .iter()
        .filter_map(|b| match b {
            doc::Block::Image { index, src, alt } => Some(ImageTarget {
                index: *index,
                src: src.clone(),
                alt: alt.clone(),
            }),
            _ => None,
        })
        .collect();

    let blocks_before_first_prose = document
        .blocks
        .iter()
        .position(|b| matches!(b, doc::Block::Paragraph { .. }))
        .unwrap_or(document.blocks.len());
    let image_count = images.len();

    let result = DocumentResult {
        title: document.title.clone(),
        pages: layout::render(&document, cols, rows),
        links,
        images,
        empty_shell: stats.looks_like_empty_shell,
        blocks_in: stats.blocks_in,
        blocks_out: stats.blocks_out,
        blocks_before_first_prose,
        image_count,
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Quantises decoded RGBA pixels to a screen of CP437 cells.
#[wasm_bindgen]
pub fn render_image(
    rgba: &[u8],
    w: u32,
    h: u32,
    cols: u16,
    max_rows: u16,
    monochrome: bool,
) -> Result<JsValue, JsValue> {
    let opts = image::Options {
        cols,
        max_rows,
        monochrome,
        ..Default::default()
    };
    let screen = image::quantise_with(rgba, w, h, opts);
    serde_wasm_bindgen::to_value(&screen).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Lays out plain text lines as a screen, with an optional colour per line.
///
/// The board's menus and prompts go through this so the shell never builds
/// cells by hand and never has to know about CP437 folding.
#[wasm_bindgen]
pub fn render_lines(
    lines: Vec<String>,
    colours: Vec<u8>,
    cols: u16,
    rows: u16,
) -> Result<JsValue, JsValue> {
    let mut s = screen::Screen::new(cols, rows);
    for (y, line) in lines.iter().take(rows as usize).enumerate() {
        let fg = screen::Colour::from_index(colours.get(y).copied().unwrap_or(7));
        let bytes = layout::to_cp437(line);
        s.write(0, y as u16, &bytes, fg, screen::Colour::Black);
    }
    serde_wasm_bindgen::to_value(&s).map_err(|e| JsValue::from_str(&e.to_string()))
}
