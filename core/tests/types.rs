use bbs_core::doc::{Block, SemanticDoc};
use bbs_core::raw::RawNode;
use bbs_core::screen::{Cell, Colour, Screen};

#[test]
fn raw_node_round_trips_through_json() {
    let n = RawNode::element(
        "p",
        vec![("class".into(), "lead".into())],
        vec![RawNode::text("hello")],
    );
    let json = serde_json::to_string(&n).unwrap();
    let back: RawNode = serde_json::from_str(&json).unwrap();
    assert_eq!(back.tag, "p");
    assert_eq!(back.attr("class"), Some("lead"));
    assert_eq!(back.children[0].text.as_deref(), Some("hello"));
}

#[test]
fn screen_is_addressable_and_starts_blank() {
    let s = Screen::new(80, 25);
    assert_eq!(s.cells.len(), 80 * 25);
    assert_eq!(s.at(0, 0).ch, b' ');
    assert_eq!(s.at(79, 24).fg, Colour::Grey);
}

#[test]
fn colour_crosses_the_wire_as_a_number_not_a_variant_name() {
    // The shell does PALETTE_CSS[cell.fg]. If serde emits "Grey" the whole
    // renderer silently draws nothing. This test is the contract.
    let json = serde_json::to_string(&Cell {
        ch: b'A',
        fg: Colour::Grey,
        bg: Colour::Black,
    })
    .unwrap();
    assert_eq!(json, r#"{"ch":65,"fg":7,"bg":0}"#);
    let back: Cell = serde_json::from_str(&json).unwrap();
    assert_eq!(back.fg, Colour::Grey);
}

#[test]
fn semantic_doc_holds_ordered_blocks() {
    let d = SemanticDoc {
        title: "Example".into(),
        blocks: vec![
            Block::Heading {
                level: 1,
                text: "Title".into(),
            },
            Block::Paragraph {
                text: "Body".into(),
            },
        ],
    };
    assert_eq!(d.blocks.len(), 2);
}

#[test]
fn text_content_does_not_weld_sibling_words_together() {
    // "Read the" + <a>report</a> + "today" must not become "Read thereport".
    let n = RawNode::element(
        "p",
        vec![],
        vec![
            RawNode::text("Read the "),
            RawNode::element("a", vec![], vec![RawNode::text("report")]),
            RawNode::text(" today."),
        ],
    );
    assert_eq!(n.text_content(), "Read the report today.");
}
