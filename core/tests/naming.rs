use bbs_core::name::{accessible_name, NameCtx};
use bbs_core::raw::RawNode;
use bbs_core::role::{native_role, Role};

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

#[test]
fn native_roles_follow_html_aam() {
    assert_eq!(native_role(&el("h2", &[], vec![])), Role::Heading(2));
    assert_eq!(native_role(&el("nav", &[], vec![])), Role::Navigation);
    assert_eq!(native_role(&el("main", &[], vec![])), Role::Main);
    assert_eq!(native_role(&el("a", &[("href", "/x")], vec![])), Role::Link);
    // An anchor without href is not a link.
    assert_eq!(native_role(&el("a", &[], vec![])), Role::Generic);
    assert_eq!(
        native_role(&el("img", &[("alt", "cat")], vec![])),
        Role::Image
    );
    // alt="" is a deliberate "decorative" signal and must be honoured.
    assert_eq!(
        native_role(&el("img", &[("alt", "")], vec![])),
        Role::Presentation
    );
}

#[test]
fn explicit_role_attribute_overrides_native() {
    assert_eq!(
        native_role(&el("div", &[("role", "navigation")], vec![])),
        Role::Navigation
    );
    assert_eq!(
        native_role(&el("h1", &[("role", "presentation")], vec![])),
        Role::Presentation
    );
}

#[test]
fn accname_precedence_aria_labelledby_wins() {
    let ctx = NameCtx::from_ids(&[("t", "From labelledby")]);
    let n = el(
        "a",
        &[
            ("href", "/x"),
            ("aria-labelledby", "t"),
            ("aria-label", "From label"),
        ],
        vec![RawNode::text("From content")],
    );
    assert_eq!(accessible_name(&n, &ctx), "From labelledby");
}

#[test]
fn accname_precedence_aria_label_beats_content() {
    let ctx = NameCtx::default();
    let n = el(
        "a",
        &[("href", "/x"), ("aria-label", "From label")],
        vec![RawNode::text("From content")],
    );
    assert_eq!(accessible_name(&n, &ctx), "From label");
}

#[test]
fn accname_falls_back_to_content_then_title() {
    let ctx = NameCtx::default();
    let with_content = el(
        "a",
        &[("href", "/x")],
        vec![RawNode::text("  From   content ")],
    );
    assert_eq!(accessible_name(&with_content, &ctx), "From content");

    let only_title = el("a", &[("href", "/x"), ("title", "From title")], vec![]);
    assert_eq!(accessible_name(&only_title, &ctx), "From title");
}

#[test]
fn image_name_comes_from_alt() {
    let ctx = NameCtx::default();
    assert_eq!(
        accessible_name(&el("img", &[("alt", "A cat")], vec![]), &ctx),
        "A cat"
    );
}
