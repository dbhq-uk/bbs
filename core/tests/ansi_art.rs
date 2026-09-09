//! Decoding .ANS art.
//!
//! Every fixture here is written by hand. Scene art is copyright its
//! artists - 16colo.rs and textfiles.com host it, they do not license it -
//! so none is committed, and the real files were checked by eye locally
//! with `cargo run --example decode_ans`.

use bbs_core::ansi_art::{decode, sauce, strip_sauce, ART_COLS};
use bbs_core::screen::Colour;

fn esc(s: &str) -> Vec<u8> {
    s.replace('E', "\x1b").into_bytes()
}

#[test]
fn plain_text_lands_at_the_top_left() {
    let s = decode(b"HI");
    assert_eq!(s.at(0, 0).ch, b'H');
    assert_eq!(s.at(1, 0).ch, b'I');
    assert_eq!(s.w, ART_COLS);
}

#[test]
fn sgr_sets_foreground_and_background() {
    // ESC[31m is red foreground, ESC[44m blue background.
    let s = decode(&esc("E[31;44mX"));
    assert_eq!(s.at(0, 0).fg, Colour::Red);
    assert_eq!(s.at(0, 0).bg, Colour::Blue);
}

#[test]
fn sgr_codes_map_straight_onto_the_palette() {
    // The trap this guards is assuming the palette is VGA's IRGB order,
    // where blue is 1 and red is 4. It is not - it is ANSI order, so 31 is
    // red and the mapping is `code - 30` with no remap.
    //
    // A remap was written first, on the IRGB assumption, and it swapped red
    // and blue across every piece of art. It looked entirely plausible: the
    // test render was a believable-looking BBS logo, just with a red frame
    // where the artist drew blue. Only these assertions caught it.
    assert_eq!(decode(&esc("E[31mX")).at(0, 0).fg, Colour::Red);
    assert_eq!(decode(&esc("E[34mX")).at(0, 0).fg, Colour::Blue);
    assert_eq!(decode(&esc("E[41mX")).at(0, 0).bg, Colour::Red);
    assert_eq!(decode(&esc("E[44mX")).at(0, 0).bg, Colour::Blue);
}

#[test]
fn bold_brightens_the_foreground_only() {
    let s = decode(&esc("E[1;31;44mX"));
    assert_eq!(s.at(0, 0).fg, Colour::BrightRed);
    assert_eq!(
        s.at(0, 0).bg,
        Colour::Blue,
        "bold must not brighten the background"
    );
}

#[test]
fn reset_returns_to_grey_on_black() {
    let s = decode(&esc("E[1;31;44mAE[0mB"));
    assert_eq!(s.at(1, 0).fg, Colour::Grey);
    assert_eq!(s.at(1, 0).bg, Colour::Black);
}

#[test]
fn cursor_positioning_is_one_based() {
    // ESC[5;10H is row 5, column 10 counting from one.
    let s = decode(&esc("E[5;10HX"));
    assert_eq!(s.at(9, 4).ch, b'X');
}

#[test]
fn cursor_moves_relative() {
    let s = decode(&esc("E[3BE[5CX"));
    assert_eq!(s.at(5, 3).ch, b'X');
}

#[test]
fn a_missing_parameter_moves_by_one() {
    // ESC[C with no number means one column, not zero.
    let s = decode(&esc("E[CX"));
    assert_eq!(s.at(1, 0).ch, b'X');
}

#[test]
fn save_and_restore_the_cursor() {
    let s = decode(&esc("E[5;5HE[sE[20;20HAE[uB"));
    assert_eq!(s.at(19, 19).ch, b'A');
    assert_eq!(s.at(4, 4).ch, b'B');
}

#[test]
fn text_wraps_at_eighty_columns() {
    // Art relies on this: a full row followed by more bytes continues on
    // the next line with no newline in the file.
    let line = vec![b'#'; 85];
    let s = decode(&line);
    assert_eq!(s.at(79, 0).ch, b'#');
    assert_eq!(s.at(0, 1).ch, b'#');
    assert_eq!(s.at(4, 1).ch, b'#');
}

#[test]
fn rows_grow_to_fit_the_art() {
    let s = decode(&esc("E[40;1HX"));
    assert!(s.h >= 40, "height was {}", s.h);
}

#[test]
fn decoding_stops_at_the_dos_eof_marker() {
    // Art files are routinely padded past 0x1A with junk, and SAUCE lives
    // after it. Left in, it decodes as a screenful of stray characters.
    let mut v = b"GOOD".to_vec();
    v.push(0x1A);
    v.extend_from_slice(b"JUNKJUNK");
    let s = decode(&v);
    assert_eq!(s.at(0, 0).ch, b'G');
    assert_eq!(
        s.at(4, 0).ch,
        b' ',
        "nothing past the EOF marker may be drawn"
    );
}

#[test]
fn strip_sauce_cuts_at_the_marker() {
    let mut v = b"ART".to_vec();
    v.push(0x1A);
    v.extend_from_slice(&[0xFF; 128]);
    assert_eq!(strip_sauce(&v), b"ART");
}

#[test]
fn reads_the_sauce_record() {
    let mut v = b"ART".to_vec();
    v.push(0x1A);
    let mut rec = vec![b' '; 128];
    rec[0..5].copy_from_slice(b"SAUCE");
    rec[7..7 + 6].copy_from_slice(b"Kilroy");
    rec[42..42 + 6].copy_from_slice(b"Smooth");
    rec[62..62 + 8].copy_from_slice(b"Nemesis!");
    v.extend_from_slice(&rec);

    let s = sauce(&v).expect("sauce present");
    assert_eq!(s.title, "Kilroy");
    assert_eq!(s.author, "Smooth");
    assert_eq!(s.group, "Nemesis!");
}

#[test]
fn no_sauce_is_not_an_error() {
    assert!(sauce(b"just art").is_none());
    assert!(sauce(&[0u8; 200]).is_none());
}

#[test]
fn clear_screen_wipes_what_came_before() {
    let s = decode(&esc("JUNKE[2JE[1;1HX"));
    assert_eq!(s.at(0, 0).ch, b'X');
    assert_eq!(s.at(1, 0).ch, b' ');
}

#[test]
fn a_hostile_file_cannot_allocate_without_bound() {
    // Cursor positioning takes an arbitrary row number, and this runs on a
    // caller's machine.
    let s = decode(&esc("E[60000;1HX"));
    assert!(s.h <= 1000, "height was {}", s.h);
}

#[test]
fn malformed_escapes_do_not_panic() {
    for bad in ["E[", "E", "E[999999999999m", "E[;;;;mX", "E[abcX", "E["] {
        let _ = decode(&esc(bad));
    }
}
