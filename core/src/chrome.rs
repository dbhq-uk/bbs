use crate::doc::{Block, SemanticDoc};
use std::collections::HashSet;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Stats {
    pub duplicate_links_removed: usize,
    pub boilerplate_links_removed: usize,
    pub blocks_in: usize,
    pub blocks_out: usize,
    /// True when there is not enough here to call it a readable document.
    /// The board uses this to show REMOTE SYSTEM RETURNED NO READABLE
    /// DOCUMENT instead of an empty screen.
    pub looks_like_empty_shell: bool,
}

/// Link text that is navigation furniture on essentially every site.
/// Matched case-insensitively against the whole trimmed string.
const BOILERPLATE: &[&str] = &[
    "skip to main content",
    "skip to content",
    "skip navigation",
    "skip to navigation",
    "accept all cookies",
    "accept cookies",
    "accept all",
    "reject all",
    "manage cookies",
    "cookie settings",
    "cookie policy",
    "privacy policy",
    "terms of service",
    "terms and conditions",
    "back to top",
    "menu",
    "close",
    "toggle navigation",
    "open menu",
    "close menu",
    "search",
    "sign in",
    "log in",
];

/// Minimum characters of prose before we believe a page rendered.
const PROSE_FLOOR: usize = 200;
/// A page can be legitimately link-heavy with little prose - a documentation
/// index, a site map, a forum board list. That is not an empty shell, and a
/// numbered menu is exactly what this product renders well.
const LINK_FLOOR: usize = 5;
/// A run shorter than this is not a menu, it is prose with links in it.
const MIN_RUN: usize = 3;
/// How much of a later run's destinations must appear in an earlier one
/// before we call it a duplicate, in percent.
const RUN_OVERLAP: usize = 70;

pub fn reject(doc: SemanticDoc) -> (SemanticDoc, Stats) {
    let mut stats = Stats {
        blocks_in: doc.blocks.len(),
        ..Default::default()
    };

    // Pass 1: drop boilerplate and empty prose.
    let mut kept: Vec<Block> = Vec::with_capacity(doc.blocks.len());
    for b in doc.blocks {
        match b {
            Block::Link { text, href, .. } => {
                if BOILERPLATE.contains(&text.trim().to_ascii_lowercase().as_str()) {
                    stats.boilerplate_links_removed += 1;
                    continue;
                }
                kept.push(Block::Link {
                    text,
                    href,
                    index: 0,
                });
            }
            Block::Paragraph { text } | Block::Quote { text } if text.trim().is_empty() => {}
            other => kept.push(other),
        }
    }

    // Pass 2: collapse duplicated navigation, by run rather than globally.
    //
    // Exact (text, href) matching both under- and over-fires. It misses the
    // real case, where a responsive site ships the same menu twice and one
    // copy has icon text the other lacks, so the accessible names differ.
    // And it wrongly deletes a legitimate second reference to the same page
    // from elsewhere in the article. Comparing whole consecutive runs by
    // destination tolerates label differences and leaves prose alone.
    let runs = link_runs(&kept);
    let mut drop_run: Vec<bool> = vec![false; runs.len()];
    for i in 0..runs.len() {
        if runs[i].len() < MIN_RUN {
            continue;
        }
        let later: HashSet<&str> = runs[i].iter().map(|&(_, h)| h).collect();
        for j in 0..i {
            if drop_run[j] || runs[j].len() < MIN_RUN {
                continue;
            }
            let earlier: HashSet<&str> = runs[j].iter().map(|&(_, h)| h).collect();
            let shared = later.intersection(&earlier).count();
            if shared * 100 / later.len().max(1) >= RUN_OVERLAP {
                drop_run[i] = true;
                break;
            }
        }
    }

    let doomed: HashSet<usize> = runs
        .iter()
        .zip(&drop_run)
        .filter(|(_, &d)| d)
        .flat_map(|(r, _)| r.iter().map(|&(idx, _)| idx))
        .collect();
    stats.duplicate_links_removed = doomed.len();

    let mut out: Vec<Block> = Vec::with_capacity(kept.len());
    for (i, b) in kept.into_iter().enumerate() {
        if doomed.contains(&i) {
            continue;
        }
        if matches!(b, Block::Rule) && matches!(out.last(), Some(Block::Rule)) {
            continue;
        }
        out.push(b);
    }

    // Trailing rules serve nothing.
    while matches!(out.last(), Some(Block::Rule)) {
        out.pop();
    }

    // Renumber links so what the reader types matches what they see.
    let mut n = 0usize;
    for b in out.iter_mut() {
        if let Block::Link { index, .. } = b {
            n += 1;
            *index = n;
        }
    }

    let prose: usize = out
        .iter()
        .map(|b| match b {
            Block::Paragraph { text } | Block::Quote { text } => text.len(),
            Block::List { items, .. } => items.iter().map(|i| i.len()).sum(),
            _ => 0,
        })
        .sum();
    let links = out
        .iter()
        .filter(|b| matches!(b, Block::Link { .. }))
        .count();

    stats.blocks_out = out.len();
    // Both floors must fail. A page with little prose but plenty of links is
    // an index, and renders as a good numbered menu - calling it an empty
    // shell would refuse to show one of the things this product does best.
    stats.looks_like_empty_shell = prose < PROSE_FLOOR && links < LINK_FLOOR;

    (
        SemanticDoc {
            title: doc.title,
            blocks: out,
        },
        stats,
    )
}

/// Consecutive runs of links, as (block index, normalised href). A run ends
/// at the first non-link block, which is what makes this segment menus
/// rather than prose.
fn link_runs(blocks: &[Block]) -> Vec<Vec<(usize, &str)>> {
    let mut runs = vec![];
    let mut cur: Vec<(usize, &str)> = vec![];
    for (i, b) in blocks.iter().enumerate() {
        match b {
            Block::Link { href, .. } => cur.push((i, normalise_href(href))),
            _ => {
                if !cur.is_empty() {
                    runs.push(std::mem::take(&mut cur));
                }
            }
        }
    }
    if !cur.is_empty() {
        runs.push(cur);
    }
    runs
}

/// Trailing slashes and fragments are not meaningful differences between two
/// copies of the same menu.
fn normalise_href(h: &str) -> &str {
    let h = h.split('#').next().unwrap_or(h);
    h.strip_suffix('/').unwrap_or(h)
}
