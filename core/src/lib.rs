//! `bbs` core: semantic projection, layout and CP437 quantisation.
//!
//! No network, no DOM, no browser API. Everything here is a pure function
//! over data the shell hands it, which is what makes it testable on the
//! host and portable to a native build later.

use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod access;
pub mod ansi;
pub mod ansi_art;
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

/// Authorisation, exported so the shell filters menus with the same rule
/// the server authorises with. Two implementations of one rule is how a
/// menu ends up offering something the server then refuses.
#[wasm_bindgen]
pub fn may_access(sl: u16, flags: &str, need_sl: u16, need_flags: &str) -> bool {
    access::may(
        &access::Caller::new(sl, flags),
        &access::Requirement::new(need_sl, need_flags),
    )
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
/// Decodes a `.ANS` file into pages of screens.
///
/// Art is drawn for 80 columns and is usually taller than a terminal, so
/// it is returned split into screenfuls the reader pages through, the same
/// way a board showed it.
#[wasm_bindgen]
pub fn render_ansi_art(bytes: &[u8], rows: u16) -> Result<JsValue, JsValue> {
    let full = ansi_art::decode(bytes);
    let sauce = ansi_art::sauce(bytes);

    let mut pages: Vec<screen::Screen> = vec![];
    let mut y = 0;
    while y < full.h {
        let take = rows.min(full.h - y);
        let mut page = screen::Screen::new(full.w, rows);
        for row in 0..take {
            for x in 0..full.w {
                page.set(x, row, full.at(x, y + row));
            }
        }
        pages.push(page);
        y += take;
    }
    if pages.is_empty() {
        pages.push(screen::Screen::new(ansi_art::ART_COLS, rows));
    }

    let result = ArtResult {
        pages,
        title: sauce.as_ref().map(|s| s.title.clone()).unwrap_or_default(),
        author: sauce.as_ref().map(|s| s.author.clone()).unwrap_or_default(),
        group: sauce.as_ref().map(|s| s.group.clone()).unwrap_or_default(),
    };
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Serialize)]
struct ArtResult {
    pages: Vec<screen::Screen>,
    title: String,
    author: String,
    group: String,
}

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

/// Renders ANSI art: one line of text plus one line of per-column colour.
///
/// The colour rows are strings of hex digits, one per column, so a screen
/// and its colouring stay legible side by side in the source rather than
/// living in a table of coordinates nobody can read.
#[wasm_bindgen]
pub fn render_art(
    lines: Vec<String>,
    fg_rows: Vec<String>,
    bg_rows: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<JsValue, JsValue> {
    let mut s = screen::Screen::new(cols, rows);
    for (y, line) in lines.iter().take(rows as usize).enumerate() {
        let bytes = layout::to_cp437(line);
        let fg_row: Vec<u8> = fg_rows.get(y).map(|r| hexes(r)).unwrap_or_default();
        let bg_row: Vec<u8> = bg_rows.get(y).map(|r| hexes(r)).unwrap_or_default();
        for (x, &ch) in bytes.iter().take(cols as usize).enumerate() {
            let fg = screen::Colour::from_index(fg_row.get(x).copied().unwrap_or(7));
            let bg = screen::Colour::from_index(bg_row.get(x).copied().unwrap_or(0));
            s.set(x as u16, y as u16, screen::Cell { ch, fg, bg });
        }
    }
    serde_wasm_bindgen::to_value(&s).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn hexes(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| c.to_digit(16).unwrap_or(7) as u8)
        .collect()
}
