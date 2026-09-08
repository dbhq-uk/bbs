use crate::raw::RawNode;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Heading(u8),
    Paragraph,
    Link,
    Image,
    List,
    ListOrdered,
    ListItem,
    Table,
    Row,
    Cell,
    HeaderCell,
    Quote,
    Separator,
    Main,
    Navigation,
    Banner,
    ContentInfo,
    Complementary,
    Search,
    Form,
    Article,
    /// Explicitly removed from the accessibility tree.
    Presentation,
    /// Carries no semantics of its own.
    Generic,
    /// Never rendered: script, style, template, head content.
    Ignored,
}

/// HTML-AAM native role mapping, with an explicit `role` attribute taking
/// precedence. Only the roles this project renders are mapped; anything
/// unrecognised is Generic and its children still get walked.
pub fn native_role(n: &RawNode) -> Role {
    if let Some(explicit) = n.attr("role") {
        if let Some(r) = role_from_attr(explicit) {
            return r;
        }
    }
    match n.tag.as_str() {
        "h1" => Role::Heading(1),
        "h2" => Role::Heading(2),
        "h3" => Role::Heading(3),
        "h4" => Role::Heading(4),
        "h5" => Role::Heading(5),
        "h6" => Role::Heading(6),
        "p" => Role::Paragraph,
        "a" => {
            if n.attr("href").is_some() {
                Role::Link
            } else {
                Role::Generic
            }
        }
        "img" => match n.attr("alt") {
            // alt="" means decorative. Honour it - one of the few author
            // signals we get for free, and it is usually correct.
            Some("") => Role::Presentation,
            _ => Role::Image,
        },
        "ul" => Role::List,
        "ol" => Role::ListOrdered,
        "li" => Role::ListItem,
        "table" => Role::Table,
        "tr" => Role::Row,
        "td" => Role::Cell,
        "th" => Role::HeaderCell,
        "blockquote" => Role::Quote,
        "hr" => Role::Separator,
        "main" => Role::Main,
        "nav" => Role::Navigation,
        "header" => Role::Banner,
        "footer" => Role::ContentInfo,
        "aside" => Role::Complementary,
        "form" => Role::Form,
        "article" => Role::Article,
        "script" | "style" | "template" | "noscript" | "head" | "meta" | "link" | "svg"
        | "iframe" | "object" | "embed" | "canvas" => Role::Ignored,
        _ => Role::Generic,
    }
}

fn role_from_attr(v: &str) -> Option<Role> {
    Some(match v.trim().to_ascii_lowercase().as_str() {
        "heading" => Role::Heading(2),
        "link" => Role::Link,
        "img" | "image" => Role::Image,
        "list" => Role::List,
        "listitem" => Role::ListItem,
        "table" => Role::Table,
        "row" => Role::Row,
        "cell" | "gridcell" => Role::Cell,
        "columnheader" | "rowheader" => Role::HeaderCell,
        "main" => Role::Main,
        "navigation" => Role::Navigation,
        "banner" => Role::Banner,
        "contentinfo" => Role::ContentInfo,
        "complementary" => Role::Complementary,
        "search" => Role::Search,
        "form" => Role::Form,
        "article" | "document" => Role::Article,
        "separator" => Role::Separator,
        "presentation" | "none" => Role::Presentation,
        _ => return None,
    })
}
