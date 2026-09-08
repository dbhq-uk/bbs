use bbs_core::doc::Block;
use bbs_core::project::{is_hidden, project};
use bbs_core::raw::RawNode;

fn el(tag: &str, attrs: &[(&str, &str)], kids: Vec<RawNode>) -> RawNode {
    RawNode::element(
        tag,
        attrs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        kids,
    )
}
fn txt(s: &str) -> RawNode {
    RawNode::text(s)
}

#[test]
fn honours_the_hidden_signals_we_can_actually_see() {
    assert!(is_hidden(&el("div", &[("hidden", "")], vec![])));
    assert!(is_hidden(&el("div", &[("aria-hidden", "true")], vec![])));
    assert!(is_hidden(&el("div", &[("style", "display:none")], vec![])));
    assert!(is_hidden(&el(
        "div",
        &[("style", "DISPLAY : NONE ;")],
        vec![]
    )));
    assert!(is_hidden(&el(
        "div",
        &[("style", "visibility:hidden")],
        vec![]
    )));
    assert!(is_hidden(&el("template", &[], vec![])));

    assert!(!is_hidden(&el("div", &[], vec![])));
    assert!(!is_hidden(&el("div", &[("aria-hidden", "false")], vec![])));
    // Off-screen text must survive: accname deliberately does not treat
    // clipped or positioned-away content as hidden, and it is usually the
    // screen-reader-only text that carries the real label.
    assert!(!is_hidden(&el("span", &[("class", "sr-only")], vec![])));
    assert!(!is_hidden(&el(
        "span",
        &[("style", "position:absolute;left:-9999px")],
        vec![]
    )));
}

#[test]
fn extracts_headings_paragraphs_and_numbered_links() {
    let doc = el(
        "body",
        &[],
        vec![
            el("h1", &[], vec![txt("Title")]),
            el("p", &[], vec![txt("Some body text.")]),
            el("a", &[("href", "/one")], vec![txt("First")]),
            el("a", &[("href", "/two")], vec![txt("Second")]),
        ],
    );
    let d = project(&doc);
    assert_eq!(
        d.blocks[0],
        Block::Heading {
            level: 1,
            text: "Title".into()
        }
    );
    assert_eq!(
        d.blocks[1],
        Block::Paragraph {
            text: "Some body text.".into()
        }
    );
    assert_eq!(
        d.blocks[2],
        Block::Link {
            text: "First".into(),
            href: "/one".into(),
            index: 1
        }
    );
    assert_eq!(
        d.blocks[3],
        Block::Link {
            text: "Second".into(),
            href: "/two".into(),
            index: 2
        }
    );
}

#[test]
fn skips_script_style_and_hidden_subtrees() {
    let doc = el(
        "body",
        &[],
        vec![
            el("script", &[], vec![txt("var x = 1;")]),
            el("style", &[], vec![txt("body{color:red}")]),
            el(
                "div",
                &[("hidden", "")],
                vec![el("p", &[], vec![txt("invisible")])],
            ),
            el("p", &[], vec![txt("visible")]),
        ],
    );
    let d = project(&doc);
    assert_eq!(d.blocks.len(), 1);
    assert_eq!(
        d.blocks[0],
        Block::Paragraph {
            text: "visible".into()
        }
    );
}

#[test]
fn decorative_images_are_dropped_and_real_ones_numbered() {
    let doc = el(
        "body",
        &[],
        vec![
            el("img", &[("alt", ""), ("src", "/spacer.gif")], vec![]),
            el("img", &[("alt", "A cat"), ("src", "/cat.jpg")], vec![]),
        ],
    );
    let d = project(&doc);
    assert_eq!(d.blocks.len(), 1);
    assert_eq!(
        d.blocks[0],
        Block::Image {
            alt: "A cat".into(),
            src: "/cat.jpg".into(),
            index: 1
        }
    );
}

#[test]
fn prefers_the_main_landmark_when_present() {
    let doc = el(
        "body",
        &[],
        vec![
            el(
                "nav",
                &[],
                vec![el("a", &[("href", "/a")], vec![txt("Nav link")])],
            ),
            el(
                "main",
                &[],
                vec![el("p", &[], vec![txt("The actual article")])],
            ),
            el(
                "footer",
                &[],
                vec![el("a", &[("href", "/b")], vec![txt("Footer link")])],
            ),
        ],
    );
    let d = project(&doc);
    assert_eq!(d.blocks.len(), 1);
    assert_eq!(
        d.blocks[0],
        Block::Paragraph {
            text: "The actual article".into()
        }
    );
}

#[test]
fn a_paragraph_with_an_inline_link_keeps_both_the_prose_and_the_target() {
    // The commonest shape in real article text. Emitting only the link
    // silently deletes most of the page's prose.
    let doc = el(
        "body",
        &[],
        vec![el(
            "p",
            &[],
            vec![
                txt("Read the "),
                el("a", &[("href", "/report")], vec![txt("annual report")]),
                txt(" today."),
            ],
        )],
    );
    let d = project(&doc);
    assert_eq!(
        d.blocks[0],
        Block::Paragraph {
            text: "Read the annual report today.".into()
        }
    );
    assert_eq!(
        d.blocks[1],
        Block::Link {
            text: "annual report".into(),
            href: "/report".into(),
            index: 1
        }
    );
}

#[test]
fn tables_actually_produce_a_table_block() {
    let doc = el(
        "body",
        &[],
        vec![el(
            "table",
            &[],
            vec![
                el(
                    "tr",
                    &[],
                    vec![
                        el("th", &[], vec![txt("Name")]),
                        el("th", &[], vec![txt("Value")]),
                    ],
                ),
                el(
                    "tr",
                    &[],
                    vec![
                        el("td", &[], vec![txt("Alpha")]),
                        el("td", &[], vec![txt("1")]),
                    ],
                ),
            ],
        )],
    );
    let d = project(&doc);
    assert_eq!(
        d.blocks[0],
        Block::Table {
            headers: vec!["Name".into(), "Value".into()],
            rows: vec![vec!["Alpha".into(), "1".into()]],
        }
    );
}

#[test]
fn a_hidden_main_landmark_does_not_empty_the_document() {
    let doc = el(
        "body",
        &[],
        vec![
            el(
                "main",
                &[("hidden", "")],
                vec![el("p", &[], vec![txt("the other layout")])],
            ),
            el("p", &[], vec![txt("the visible article")]),
        ],
    );
    let d = project(&doc);
    assert!(d.blocks.iter().any(|b| *b
        == Block::Paragraph {
            text: "the visible article".into()
        }));
}

#[test]
fn title_comes_from_the_title_element() {
    let doc = el(
        "html",
        &[],
        vec![
            el(
                "head",
                &[],
                vec![el("title", &[], vec![txt("Example Page")])],
            ),
            el("body", &[], vec![el("p", &[], vec![txt("x")])]),
        ],
    );
    assert_eq!(project(&doc).title, "Example Page");
}

#[test]
fn lists_keep_their_items_together() {
    let doc = el(
        "body",
        &[],
        vec![el(
            "ul",
            &[],
            vec![
                el("li", &[], vec![txt("One")]),
                el("li", &[], vec![txt("Two")]),
            ],
        )],
    );
    let d = project(&doc);
    assert_eq!(
        d.blocks[0],
        Block::List {
            items: vec!["One".into(), "Two".into()],
            ordered: false
        }
    );
}

#[test]
fn a_list_of_cards_is_descended_into_not_flattened_to_text() {
    // Modern sites build card grids out of lists: every item holds a link,
    // a heading and an image. Flattening to text content and returning
    // threw all of that away - on the BBC News front page it reduced 119
    // images and 210 links to none and seven.
    let doc = el(
        "body",
        &[],
        vec![el(
            "ul",
            &[],
            vec![
                el(
                    "li",
                    &[],
                    vec![
                        el("h3", &[], vec![txt("Headline one")]),
                        el("a", &[("href", "/one")], vec![txt("Read one")]),
                        el("img", &[("src", "/1.jpg"), ("alt", "Picture one")], vec![]),
                    ],
                ),
                el(
                    "li",
                    &[],
                    vec![
                        el("h3", &[], vec![txt("Headline two")]),
                        el("a", &[("href", "/two")], vec![txt("Read two")]),
                    ],
                ),
            ],
        )],
    );
    let d = project(&doc);
    assert!(!d.blocks.iter().any(|b| matches!(b, Block::List { .. })),
        "a card grid must not be flattened into a text list");
    assert_eq!(
        d.blocks.iter().filter(|b| matches!(b, Block::Link { .. })).count(), 2);
    assert_eq!(
        d.blocks.iter().filter(|b| matches!(b, Block::Image { .. })).count(), 1);
    assert_eq!(
        d.blocks.iter().filter(|b| matches!(b, Block::Heading { .. })).count(), 2);
}

#[test]
fn a_list_of_plain_text_is_still_flattened() {
    let doc = el(
        "body",
        &[],
        vec![el(
            "ul",
            &[],
            vec![
                el("li", &[], vec![txt("Milk")]),
                el("li", &[], vec![txt("Eggs")]),
            ],
        )],
    );
    let d = project(&doc);
    assert_eq!(
        d.blocks[0],
        Block::List { items: vec!["Milk".into(), "Eggs".into()], ordered: false }
    );
}
