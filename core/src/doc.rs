use serde::{Deserialize, Serialize};

/// The normalised semantic document.
///
/// This is the boundary the spec requires: a native build can produce one of
/// these from html5ever without the renderer knowing anything changed.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SemanticDoc {
    pub title: String,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Block {
    Heading {
        level: u8,
        text: String,
    },
    Paragraph {
        text: String,
    },
    /// `index` is the number shown to the reader and typed to follow it.
    Link {
        text: String,
        href: String,
        index: usize,
    },
    List {
        items: Vec<String>,
        ordered: bool,
    },
    Image {
        alt: String,
        src: String,
        index: usize,
    },
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Quote {
        text: String,
    },
    Rule,
}
