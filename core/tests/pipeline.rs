use bbs_core::doc::Block;
use bbs_core::project::project_and_clean;
use bbs_core::raw::RawNode;

#[test]
fn the_full_pipeline_produces_pages_from_a_raw_tree() {
    let json = r#"{
        "tag":"body","attrs":[],"children":[
            {"tag":"h1","attrs":[],"children":[{"tag":"","text":"Hello"}]},
            {"tag":"p","attrs":[],"children":[{"tag":"","text":"Some prose that is long enough to clear the empty-shell floor. It has to exceed two hundred characters of real body text, which is longer than it looks, so this sentence carries on a good deal further than feels natural in order to get there."}]}
        ]}"#;
    let raw: RawNode = serde_json::from_str(json).unwrap();
    let (doc, stats) = project_and_clean(&raw);

    // Guard the fixture itself: an earlier draft used 154 characters
    // against a 200-character floor and could never have passed.
    let prose_len = match &doc.blocks[1] {
        Block::Paragraph { text } => text.len(),
        other => panic!("expected a paragraph, got {other:?}"),
    };
    assert!(prose_len >= 200, "fixture is too short: {prose_len} chars");

    assert!(!stats.looks_like_empty_shell);
    assert_eq!(
        doc.blocks[0],
        Block::Heading {
            level: 1,
            text: "Hello".into()
        }
    );
    let pages = bbs_core::layout::render(&doc, 80, 25);
    assert!(!pages.is_empty());
}
