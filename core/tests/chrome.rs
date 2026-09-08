use bbs_core::chrome::reject;
use bbs_core::doc::{Block, SemanticDoc};

fn link(text: &str, href: &str, index: usize) -> Block {
    Block::Link {
        text: text.into(),
        href: href.into(),
        index,
    }
}
fn para(text: &str) -> Block {
    Block::Paragraph { text: text.into() }
}

#[test]
fn collapses_a_navigation_block_duplicated_for_responsive_layouts() {
    // The single most damaging real-world case: desktop and mobile navs
    // both present, one hidden by external CSS we cannot see.
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            link("Home", "/", 1),
            link("News", "/news", 2),
            link("About", "/about", 3),
            para("The article body goes here and is long enough to be real prose."),
            link("Home", "/", 4),
            link("News", "/news", 5),
            link("About", "/about", 6),
        ],
    };
    let (out, stats) = reject(d);
    let hrefs: Vec<&str> = out
        .blocks
        .iter()
        .filter_map(|b| match b {
            Block::Link { href, .. } => Some(href.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(hrefs, vec!["/", "/news", "/about"]);
    assert_eq!(stats.duplicate_links_removed, 3);
}

#[test]
fn collapses_a_duplicate_menu_even_when_the_labels_differ() {
    // The case exact matching misses: the mobile copy has icon text the
    // desktop copy lacks, so the accessible names are not equal.
    // Destinations are what identify a menu.
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            link("Home", "/", 1),
            link("News", "/news", 2),
            link("About", "/about", 3),
            para("The article body goes here and is long enough to be real prose."),
            link("\u{2302} Home", "/", 4),
            link("News \u{203a}", "/news/", 5),
            link("About us", "/about#top", 6),
        ],
    };
    let (out, stats) = reject(d);
    assert_eq!(stats.duplicate_links_removed, 3);
    assert_eq!(
        out.blocks
            .iter()
            .filter(|b| matches!(b, Block::Link { .. }))
            .count(),
        3
    );
}

#[test]
fn leaves_a_repeated_link_inside_prose_alone() {
    // A second reference to the same page from a different paragraph is a
    // real link, not a duplicate menu. Global matching would delete it.
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            para("First paragraph mentioning the report."),
            link("the report", "/report", 1),
            para("Second paragraph mentioning the report again."),
            link("the report", "/report", 2),
        ],
    };
    let (out, stats) = reject(d);
    assert_eq!(stats.duplicate_links_removed, 0);
    assert_eq!(
        out.blocks
            .iter()
            .filter(|b| matches!(b, Block::Link { .. }))
            .count(),
        2
    );
}

#[test]
fn renumbers_links_after_removal_so_the_reader_can_type_them() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            link("Skip to main content", "#main", 1),
            link("A", "/a", 2),
            link("B", "/b", 3),
        ],
    };
    let (out, _) = reject(d);
    let idx: Vec<usize> = out
        .blocks
        .iter()
        .filter_map(|b| match b {
            Block::Link { index, .. } => Some(*index),
            _ => None,
        })
        .collect();
    assert_eq!(idx, vec![1, 2]);
}

#[test]
fn drops_boilerplate_links_by_text() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            link("Skip to main content", "#main", 1),
            link("Accept all cookies", "#", 2),
            link("Real article", "/real", 3),
        ],
    };
    let (out, _) = reject(d);
    assert_eq!(out.blocks.len(), 1);
    assert_eq!(out.blocks[0], link("Real article", "/real", 1));
}

#[test]
fn drops_empty_and_whitespace_only_paragraphs() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            para(""),
            para("   "),
            para("Real text that is long enough."),
        ],
    };
    let (out, _) = reject(d);
    assert_eq!(out.blocks.len(), 1);
}

#[test]
fn collapses_runs_of_rules() {
    let d = SemanticDoc {
        title: "T".into(),
        blocks: vec![
            Block::Rule,
            Block::Rule,
            Block::Rule,
            para("Text after the rules."),
        ],
    };
    let (out, _) = reject(d);
    assert_eq!(out.blocks[0], Block::Rule);
    assert_eq!(out.blocks[1], para("Text after the rules."));
}

#[test]
fn reports_an_empty_shell_rather_than_pretending_it_worked() {
    // An SPA arrives as a div and nothing else. The board must be able to
    // say so in-world rather than render a blank screen.
    let d = SemanticDoc {
        title: "App".into(),
        blocks: vec![],
    };
    let (out, stats) = reject(d);
    assert!(out.blocks.is_empty());
    assert!(stats.looks_like_empty_shell);
}

#[test]
fn a_link_index_is_not_an_empty_shell() {
    // A documentation index or forum board list has little prose and many
    // links. That is a good numbered menu, not a failure, and it is one of
    // the things this product renders best.
    let d = SemanticDoc {
        title: "T".into(),
        blocks: (1..=30)
            .map(|i| link(&format!("Article {i}"), &format!("/a/{i}"), i))
            .collect(),
    };
    let (_, stats) = reject(d);
    assert!(!stats.looks_like_empty_shell);
}

#[test]
fn a_page_with_neither_prose_nor_links_is_an_empty_shell() {
    let d = SemanticDoc {
        title: "App".into(),
        blocks: vec![para("Loading"), link("Home", "/", 1)],
    };
    let (_, stats) = reject(d);
    assert!(stats.looks_like_empty_shell);
}
