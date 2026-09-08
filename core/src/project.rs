use crate::chrome::{self, Stats};
use crate::doc::{Block, SemanticDoc};
use crate::name::{accessible_name, NameCtx};
use crate::raw::RawNode;
use crate::role::{native_role, Role};

/// The hidden signals we can see without a CSS cascade.
///
/// Deliberately NOT detected, per the spec: anything hidden by an external
/// stylesheet. That is the single largest source of junk in the projection
/// (responsive duplicate navigation, closed accordions, cookie banners) and
/// it is the chrome heuristics' job, not this function's.
pub fn is_hidden(n: &RawNode) -> bool {
    if n.tag == "template" {
        return true;
    }
    if n.attrs.iter().any(|(k, _)| k == "hidden") {
        return true;
    }
    if n.attr("aria-hidden") == Some("true") {
        return true;
    }
    if let Some(style) = n.attr("style") {
        let s: String = style.chars().filter(|c| !c.is_whitespace()).collect();
        let s = s.to_ascii_lowercase();
        if s.contains("display:none") || s.contains("visibility:hidden") {
            return true;
        }
    }
    false
}

struct Walk<'a> {
    ctx: &'a NameCtx,
    blocks: Vec<Block>,
    link_index: usize,
    image_index: usize,
}

pub fn project(root: &RawNode) -> SemanticDoc {
    let ctx = NameCtx::build(root);
    let title = find_title(root).unwrap_or_default();

    // Prefer the main landmark. The cheapest and most reliable chrome
    // rejection available, which is why it comes first.
    let start = find_main(root).unwrap_or(root);

    let mut w = Walk {
        ctx: &ctx,
        blocks: vec![],
        link_index: 0,
        image_index: 0,
    };
    w.walk(start);
    SemanticDoc {
        title,
        blocks: w.blocks,
    }
}

/// The whole pipeline from a serialised DOM to a cleaned document.
/// This is what the shell calls.
pub fn project_and_clean(root: &RawNode) -> (SemanticDoc, Stats) {
    chrome::reject(project(root))
}

fn find_title(n: &RawNode) -> Option<String> {
    if n.tag == "title" {
        let t = n.text_content();
        if !t.is_empty() {
            return Some(t);
        }
    }
    n.children.iter().find_map(find_title)
}

fn find_main(n: &RawNode) -> Option<&RawNode> {
    // A hidden main landmark is common on sites that swap layouts, and
    // returning it yields an empty document from a page that had content.
    if is_hidden(n) {
        return None;
    }
    if native_role(n) == Role::Main {
        return Some(n);
    }
    n.children.iter().find_map(find_main)
}

/// Links anywhere below a node, in document order, skipping hidden subtrees.
fn descendant_links(n: &RawNode) -> Vec<&RawNode> {
    let mut out = vec![];
    collect_by_role(n, Role::Link, &mut out);
    out
}

fn descendant_images(n: &RawNode) -> Vec<&RawNode> {
    let mut out = vec![];
    collect_by_role(n, Role::Image, &mut out);
    out
}

fn collect_by_role<'a>(n: &'a RawNode, want: Role, out: &mut Vec<&'a RawNode>) {
    for c in &n.children {
        if c.is_text() || is_hidden(c) {
            continue;
        }
        if native_role(c) == want {
            out.push(c);
        }
        collect_by_role(c, want, out);
    }
}

/// Reads a table into headers and rows. A row of only `th` cells becomes the
/// header; every later row becomes a row of cell text.
fn read_table(n: &RawNode) -> (Vec<String>, Vec<Vec<String>>) {
    let mut rows_out: Vec<Vec<String>> = vec![];
    let mut headers: Vec<String> = vec![];
    let mut trs = vec![];
    collect_by_role(n, Role::Row, &mut trs);

    for tr in trs {
        if is_hidden(tr) {
            continue;
        }
        let mut header_cells = vec![];
        let mut data_cells = vec![];
        for c in &tr.children {
            match native_role(c) {
                Role::HeaderCell => header_cells.push(c.text_content()),
                Role::Cell => data_cells.push(c.text_content()),
                _ => {}
            }
        }
        if headers.is_empty() && !header_cells.is_empty() && data_cells.is_empty() {
            headers = header_cells;
        } else {
            let mut row = header_cells;
            row.extend(data_cells);
            if !row.is_empty() {
                rows_out.push(row);
            }
        }
    }
    (headers, rows_out)
}

impl Walk<'_> {
    fn walk(&mut self, n: &RawNode) {
        if n.is_text() || is_hidden(n) {
            return;
        }
        let role = native_role(n);
        match role {
            Role::Ignored | Role::Presentation => return,
            Role::Heading(level) => {
                let text = accessible_name(n, self.ctx);
                if !text.is_empty() {
                    self.blocks.push(Block::Heading { level, text });
                }
                return;
            }
            Role::Link => {
                self.push_link(n);
                return;
            }
            Role::Image => {
                self.push_image(n);
                return;
            }
            Role::Paragraph | Role::Quote => {
                // Emit the prose AND the links inside it. Choosing one loses
                // the other, and inline links are everywhere in real article
                // text - "Read the <a>report</a> today" must not become just
                // "report". text_content() already includes the link text, so
                // the sentence stays whole and the targets are listed after
                // it, which is how a text client has always done this.
                let text = n.text_content();
                if !text.is_empty() {
                    self.blocks.push(match role {
                        Role::Quote => Block::Quote { text },
                        _ => Block::Paragraph { text },
                    });
                }
                for l in descendant_links(n) {
                    self.push_link(l);
                }
                for img in descendant_images(n) {
                    self.push_image(img);
                }
                return;
            }
            Role::Table => {
                // Without this arm Role::Table falls through to the generic
                // descent and Block::Table is never constructed at all.
                let (headers, rows) = read_table(n);
                if !headers.is_empty() || !rows.is_empty() {
                    self.blocks.push(Block::Table { headers, rows });
                }
                return;
            }
            Role::List | Role::ListOrdered => {
                let ordered = role == Role::ListOrdered;
                let items: Vec<String> = n
                    .children
                    .iter()
                    .filter(|c| native_role(c) == Role::ListItem && !is_hidden(c))
                    .map(|c| c.text_content())
                    .filter(|s| !s.is_empty())
                    .collect();
                // Only flatten a list when its items are genuinely plain
                // text. Modern sites build card grids out of lists, and
                // every item holds a link, a heading and an image - so
                // flattening to text content and returning threw all of
                // that away. On the BBC News front page that was 119
                // images and 210 links reduced to seven links and none.
                if !items.is_empty() && list_is_plain_text(n) {
                    self.blocks.push(Block::List { items, ordered });
                    return;
                }
            }
            Role::Separator => {
                self.blocks.push(Block::Rule);
                return;
            }
            _ => {}
        }
        for c in &n.children {
            self.walk(c);
        }
    }

    fn push_link(&mut self, n: &RawNode) {
        let text = accessible_name(n, self.ctx);
        let href = n.attr("href").unwrap_or_default().to_string();
        if !text.is_empty() && !href.is_empty() {
            self.link_index += 1;
            self.blocks.push(Block::Link {
                text,
                href,
                index: self.link_index,
            });
        }
    }

    fn push_image(&mut self, n: &RawNode) {
        let alt = accessible_name(n, self.ctx);
        let src = n.attr("src").unwrap_or_default().to_string();
        if !src.is_empty() {
            self.image_index += 1;
            self.blocks.push(Block::Image {
                alt,
                src,
                index: self.image_index,
            });
        }
    }
}

/// Whether a list is a list of prose, rather than a container for
/// structured content.
///
/// A list item holding a link, a heading or an image is a card, and its
/// contents matter more than the text they happen to contain. Only a list
/// whose items carry none of those is safe to flatten into a Block::List.
fn list_is_plain_text(n: &RawNode) -> bool {
    let items: Vec<&RawNode> = n
        .children
        .iter()
        .filter(|c| native_role(c) == Role::ListItem)
        .collect();
    !items.is_empty()
        && items.iter().all(|li| {
            descendant_links(li).is_empty() && descendant_images(li).is_empty() && !has_heading(li)
        })
}

fn has_heading(n: &RawNode) -> bool {
    n.children.iter().any(|c| {
        !c.is_text()
            && !is_hidden(c)
            && (matches!(native_role(c), Role::Heading(_)) || has_heading(c))
    })
}
