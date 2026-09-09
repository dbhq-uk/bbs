//! Golden ANSI snapshots of the quantiser.
//!
//! WHY THESE EXIST, given image.rs is already covered.
//!
//! The existing tests are property assertions - aspect correction, half
//! block selection, alpha compositing, palette bounds. Every one of them
//! passes on output that is complete mush, because none of them can see
//! the picture. They check that the machinery ran, not that it produced
//! anything a person would recognise.
//!
//! A snapshot can. `cat` one of these files and the image appears in the
//! terminal in colour, so a regression that turns a face into grey
//! porridge shows up as a diff a human can judge.
//!
//! THE RULE THAT MAKES THEM WORTH ANYTHING: never accept a snapshot
//! without looking at it. An accepted snapshot is a claim that this output
//! is good, and an unexamined one defends mush forever - it will fail
//! loudly the day someone improves the quantiser, and pass silently every
//! day it stays bad.
//!
//! The four fixtures are chosen to fail in different ways:
//!
//!   portrait    a real photograph of a face. The hardest case and the
//!               most diagnostic - features live in tonal variation
//!               narrower than the gap between palette entries, so this is
//!               what catches the whole face posterising to one flat tone.
//!   logo        flat fills, hard edges, thin strokes. Catches edges going
//!               ragged and thin lines dropping out entirely.
//!   gradient    smooth tone in two directions. Catches banding, and any
//!               dither artefact - a per-cell pattern shows up here as a
//!               checkerboard and nowhere else.
//!   screenshot  11px UI text. Records a LIMIT rather than a success: at
//!               60 columns a 640px screenshot gets about 10px per cell,
//!               so a character has under two cells to live in and the
//!               text cannot survive at any quality of quantiser. What
//!               does survive is the layout, and that is what the test
//!               pins.

use bbs_core::ansi;
use bbs_core::image::{quantise_with, GlyphSet, Options};

/// Decodes a fixture to RGBA8.
fn fixture(name: &str) -> (Vec<u8>, u32, u32) {
    let path = format!("{}/tests/fixtures/{name}.png", env!("CARGO_MANIFEST_DIR"));
    let file = std::fs::File::open(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    let decoder = png::Decoder::new(file);
    let mut reader = decoder.read_info().expect("png header");
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("png frame");
    buf.truncate(info.buffer_size());

    // The core takes RGBA and nothing else, so anything narrower is widened
    // here rather than teaching the quantiser about colour types.
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf
            .chunks(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::Grayscale => buf.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        other => panic!("{name}: unsupported colour type {other:?}"),
    };
    (rgba, info.width, info.height)
}

fn render(name: &str, opts: Options) -> String {
    let (rgba, w, h) = fixture(name);
    ansi::encode(&quantise_with(&rgba, w, h, opts))
}

/// 60 columns, so a snapshot fits a terminal beside a diff.
fn opts() -> Options {
    Options {
        cols: 60,
        max_rows: 40,
        ..Options::default()
    }
}

#[test]
fn portrait_is_a_recognisable_face() {
    insta::assert_snapshot!(render("portrait", opts()));
}

#[test]
fn logo_keeps_its_edges_and_thin_strokes() {
    insta::assert_snapshot!(render("logo", opts()));
}

#[test]
fn gradient_is_smooth_and_free_of_checkerboarding() {
    insta::assert_snapshot!(render("gradient", opts()));
}

/// Small text does NOT survive, and this records that honestly.
///
/// The first version of this test was called
/// `screenshot_small_text_still_reads_as_text`, and the snapshot it
/// accepted showed rows of grey dashes. The name would have told every
/// future reader the opposite of what the file underneath it contained,
/// which is worse than having no test.
///
/// The cause is resolution, not quality. At 60 columns a 640px-wide
/// screenshot gets ~10px per cell horizontally and ~21px vertically, so an
/// 11px character has under two cells to live in and more than one line of
/// text falls inside a single cell row. No quantiser recovers that; the
/// information is gone before glyph selection begins.
///
/// What DOES survive is the shape of the page - the dark header bar, the
/// banded rows, the blue button - and that is worth pinning, because
/// losing it too would be a real regression.
#[test]
fn screenshot_keeps_its_layout_though_small_text_cannot_survive() {
    insta::assert_snapshot!(render("screenshot", opts()));
}

/// The monochrome path is a separate renderer, not a filter over the
/// colour one, so it gets its own eye check. A face is the case that
/// exposes it: with no hue to lean on, everything rests on the glyph
/// choice.
#[test]
fn portrait_in_monochrome_still_reads() {
    insta::assert_snapshot!(render(
        "portrait",
        Options {
            monochrome: true,
            ..opts()
        }
    ));
}

/// Restricting the glyph set has to be tested on an image that DEPENDS on
/// the glyphs it removes.
///
/// This was first written against the logo and was near enough a duplicate
/// of the unrestricted snapshot - the logo is flat fills and thin outlines,
/// so the same glyphs get chosen either way and the restriction changed
/// nothing visible. A test whose comment claims to probe something, over
/// output that proves it did not, is just a second copy of another test.
///
/// The gradient is the honest subject: it is carried entirely by the shade
/// blocks, so taking them away is a real question about whether structure
/// survives on glyph choice alone.
#[test]
fn gradient_with_box_glyphs_only() {
    insta::assert_snapshot!(render(
        "gradient",
        Options {
            glyphs: GlyphSet::Box,
            ..opts()
        }
    ));
}
