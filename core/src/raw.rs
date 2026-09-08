use serde::{Deserialize, Serialize};

/// A node as the shell serialises it out of a `DOMParser` document.
///
/// Deliberately dumb: no roles, no names, no filtering. Those are core's job,
/// so that a native build can produce one of these from html5ever without the
/// projection knowing anything changed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawNode {
    /// Lowercase element name. Empty string for a text node.
    #[serde(default)]
    pub tag: String,
    /// Present only on text nodes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attrs: Vec<(String, String)>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<RawNode>,
}

impl RawNode {
    pub fn element(tag: &str, attrs: Vec<(String, String)>, children: Vec<RawNode>) -> Self {
        RawNode {
            tag: tag.to_string(),
            text: None,
            attrs,
            children,
        }
    }

    pub fn text(s: &str) -> Self {
        RawNode {
            tag: String::new(),
            text: Some(s.to_string()),
            attrs: vec![],
            children: vec![],
        }
    }

    pub fn is_text(&self) -> bool {
        self.tag.is_empty()
    }

    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    /// Concatenated descendant text, whitespace-collapsed.
    pub fn text_content(&self) -> String {
        let mut out = String::new();
        self.collect_text(&mut out);
        collapse_ws(&out)
    }

    fn collect_text(&self, out: &mut String) {
        if let Some(t) = &self.text {
            out.push_str(t);
            // Text nodes are siblings of elements, and without a separator
            // "Read the" + "report" becomes "Read thereport".
            out.push(' ');
        }
        for c in &self.children {
            c.collect_text(out);
        }
    }
}

pub fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
