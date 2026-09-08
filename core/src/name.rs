use crate::raw::{collapse_ws, RawNode};
use std::collections::HashMap;

/// Lookup for `aria-labelledby` and `<label for>` resolution. Built once per
/// document by walking it for `id` attributes.
#[derive(Debug, Default)]
pub struct NameCtx {
    by_id: HashMap<String, String>,
}

impl NameCtx {
    pub fn from_ids(pairs: &[(&str, &str)]) -> Self {
        NameCtx {
            by_id: pairs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    /// Walks a document collecting id -> text content.
    pub fn build(root: &RawNode) -> Self {
        let mut by_id = HashMap::new();
        collect(root, &mut by_id);
        NameCtx { by_id }
    }

    fn text_for(&self, id: &str) -> Option<&str> {
        self.by_id.get(id).map(|s| s.as_str())
    }
}

fn collect(n: &RawNode, out: &mut HashMap<String, String>) {
    if let Some(id) = n.attr("id") {
        out.insert(id.to_string(), n.text_content());
    }
    for c in &n.children {
        collect(c, out);
    }
}

/// The accname precedence chain, DOM-only.
///
/// Deliberately NOT implemented, per the spec: computed `display` and
/// `visibility`, `::before`/`::after`/`::marker` generated content, and
/// shadow-root slot traversal. Those need a CSS cascade, and building a
/// partial one ends in a bad browser engine.
pub fn accessible_name(n: &RawNode, ctx: &NameCtx) -> String {
    // 1. aria-labelledby, space-separated idrefs.
    if let Some(ids) = n.attr("aria-labelledby") {
        let joined: Vec<&str> = ids
            .split_whitespace()
            .filter_map(|id| ctx.text_for(id))
            .collect();
        if !joined.is_empty() {
            return collapse_ws(&joined.join(" "));
        }
    }
    // 2. aria-label.
    if let Some(l) = n.attr("aria-label") {
        let l = collapse_ws(l);
        if !l.is_empty() {
            return l;
        }
    }
    // 3. Host-language attribute: alt on img.
    if n.tag == "img" {
        if let Some(a) = n.attr("alt") {
            return collapse_ws(a);
        }
    }
    // 4. Content.
    let content = n.text_content();
    if !content.is_empty() {
        return content;
    }
    // 5. title, the tooltip fallback.
    if let Some(t) = n.attr("title") {
        return collapse_ws(t);
    }
    String::new()
}
