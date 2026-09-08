//! Security Levels and Access Restriction flags.
//!
//! This model is not invented here. WWIV (1984) gave every user a numeric
//! security level and had every gated thing declare the level it needs;
//! Telegard was built on WWIV's source and kept it, Renegade on
//! Telegard's, and both modern survivors - Synchronet and Mystic - still
//! use it. Forty years of every serious package agreeing is a good reason
//! to copy something rather than invent.
//!
//! The alternative, branching on a user type at each call site, hardcodes
//! today's two tiers into every one of them. Here a tier is a number, and
//! a menu item's visibility and its authorisation come from the same
//! declaration, so they cannot drift apart.

use std::collections::BTreeSet;

/// Security level. Higher is more privileged; see `level` below.
pub type Level = u16;

/// Access Restriction flags: single letters, orthogonal to level.
///
/// A level cannot express "a member whose gateway access was revoked",
/// because demoting them would take the whole board away too. Flags can,
/// which is the entire reason both exist.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Flags(BTreeSet<char>);

impl Flags {
    pub fn parse(s: &str) -> Self {
        Flags(s.chars().filter(|c| !c.is_whitespace()).collect())
    }

    pub fn contains_all(&self, other: &Flags) -> bool {
        other.0.is_subset(&self.0)
    }

    pub fn as_string(&self) -> String {
        self.0.iter().collect()
    }
}

#[derive(Debug, Clone)]
pub struct Caller {
    pub sl: Level,
    pub flags: Flags,
}

impl Caller {
    pub fn new(sl: Level, flags: &str) -> Self {
        Caller {
            sl,
            flags: Flags::parse(flags),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Requirement {
    pub sl: Level,
    pub flags: Flags,
}

impl Requirement {
    pub fn new(sl: Level, flags: &str) -> Self {
        Requirement {
            sl,
            flags: Flags::parse(flags),
        }
    }
}

/// The whole authorisation rule: the level is sufficient, and every
/// required flag is held. A higher level never substitutes for a missing
/// flag.
pub fn may(caller: &Caller, need: &Requirement) -> bool {
    caller.sl >= need.sl && caller.flags.contains_all(&need.flags)
}

/// The levels the spec defines, named so call sites never use a bare
/// integer and nobody has to remember what 20 means.
pub mod level {
    use super::Level;
    /// Logged on, read-only, no gateway. The moderation sanction, present
    /// so it exists before it is needed.
    pub const TWIT: Level = 0;
    /// The board, the conferences, and the gateway restricted to the
    /// curated site list.
    pub const GUEST: Level = 10;
    /// Email confirmed. The open internet, and the community.
    pub const MEMBER: Level = 20;
    /// Bulletins, the user editor, the kill switch.
    pub const SYSOP: Level = 100;
}

/// The flags the spec defines.
pub mod flag {
    /// Email verified.
    pub const VERIFIED: char = 'V';
    /// Gateway access. Revocable without demoting a member.
    pub const GATEWAY: char = 'G';
    /// May post. A lighter sanction than dropping to TWIT.
    pub const POST: char = 'P';
    /// Sysop tools.
    pub const SYSOP: char = 'S';
}
