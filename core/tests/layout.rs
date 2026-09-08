use bbs_core::ansi::encode;
use bbs_core::doc::{Block, SemanticDoc};
use bbs_core::layout::{render, to_cp437};
use bbs_core::screen::{Colour, Screen};

fn row_text(s: &Screen, y: u16) -> String {
    (0..s.w)
        .map(|x| s.at(x, y).ch as char)
        .collect::<String>()
        .trim_end()
        .to_string()
}

#[test]
fn wraps_prose_at_the_column_width_without_splitting_words() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::Paragraph {
            text: "the quick brown fox jumps over the lazy dog and keeps on running \
                   until it reaches the far end of the line"
                .into(),
        }],
    };
    let pages = render(&d, 40, 25);
    let first = row_text(&pages[0], 0);
    assert!(first.len() <= 40, "line was {} chars", first.len());
    assert!(!first.ends_with('-'), "should not hyphenate");
    // Nothing should be cut mid-word: the last token must be a whole word
    // from the source.
    let src = "the quick brown fox jumps over the lazy dog and keeps on running \
               until it reaches the far end of the line";
    let last = first.split(' ').next_back().unwrap();
    assert!(
        src.split_whitespace().any(|w| w == last),
        "cut word: {last}"
    );
}

#[test]
fn headings_are_bright_and_body_text_is_not() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            Block::Heading {
                level: 1,
                text: "Headline".into(),
            },
            Block::Paragraph {
                text: "Body".into(),
            },
        ],
    };
    let pages = render(&d, 80, 25);
    let s = &pages[0];
    assert_eq!(s.at(0, 0).fg, Colour::BrightYellow);
    let body_row = (0..25).find(|&y| row_text(s, y) == "Body").unwrap();
    assert_eq!(s.at(0, body_row).fg, Colour::Grey);
}

#[test]
fn links_are_numbered_in_brackets_so_they_can_be_typed() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::Link {
            text: "Read more".into(),
            href: "/more".into(),
            index: 7,
        }],
    };
    let pages = render(&d, 80, 25);
    assert!(row_text(&pages[0], 0).starts_with("[ 7] Read more"));
}

#[test]
fn overflowing_content_paginates_rather_than_truncating() {
    let blocks: Vec<Block> = (0..100)
        .map(|i| Block::Paragraph {
            text: format!("Line number {i}"),
        })
        .collect();
    let d = SemanticDoc {
        title: "T".into(),
        blocks,
    };
    let pages = render(&d, 80, 25);
    assert!(pages.len() > 1, "should have paginated");
    for p in &pages {
        assert_eq!(p.h, 25);
    }
}

#[test]
fn cp437_conversion_maps_common_typography_rather_than_dropping_it() {
    // Smart quotes and dashes are everywhere on the real web. Losing them
    // silently makes text look broken.
    assert_eq!(to_cp437("\u{201c}quoted\u{201d}"), b"\"quoted\"".to_vec());
    assert_eq!(to_cp437("it\u{2019}s"), b"it's".to_vec());
    assert_eq!(to_cp437("a \u{2014} b"), b"a - b".to_vec());
    assert_eq!(to_cp437("caf\u{e9}"), vec![b'c', b'a', b'f', 0x82]);
    assert_eq!(to_cp437("\u{2026}"), b"...".to_vec());
}

#[test]
fn cp437_bytes_survive_word_wrapping() {
    // The wrapper must never rebuild a String from CP437 bytes. If it does,
    // every byte above 0x7f becomes U+FFFD and accented text arrives as
    // replacement characters.
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::Paragraph {
            text: "caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9}".into(),
        }],
    };
    let pages = render(&d, 80, 25);
    let row: Vec<u8> = (0..pages[0].w).map(|x| pages[0].at(x, 0).ch).collect();
    assert!(row.contains(&0x82), "e-acute should be CP437 0x82");
    assert!(row.contains(&0x8B), "i-diaeresis should be CP437 0x8B");
    assert!(
        !row.contains(&b'?'),
        "nothing should have degraded to a question mark"
    );
}

#[test]
fn an_unordered_list_uses_the_cp437_bullet_not_a_question_mark() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::List {
            items: vec!["One".into()],
            ordered: false,
        }],
    };
    let pages = render(&d, 80, 25);
    let row: Vec<u8> = (0..pages[0].w).map(|x| pages[0].at(x, 0).ch).collect();
    assert!(row.contains(&0xF9), "bullet should be CP437 0xF9");
    assert!(!row.contains(&b'?'));
}

#[test]
fn an_indented_block_still_fits_the_screen() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::Quote {
            text: "word ".repeat(60),
        }],
    };
    let pages = render(&d, 80, 25);
    for p in &pages {
        for y in 0..p.h {
            let text = row_text(p, y);
            assert!(text.len() <= 80, "row {y} was {} chars", text.len());
        }
    }
}

#[test]
fn ansi_encoding_round_trips_a_screen_to_escape_sequences() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![Block::Heading {
            level: 1,
            text: "Hi".into(),
        }],
    };
    let pages = render(&d, 80, 25);
    let out = encode(&pages[0]);
    assert!(out.contains("\u{1b}["), "should contain escape sequences");
    assert!(out.contains("Hi"));
}
