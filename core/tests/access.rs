use bbs_core::access::{level, may, Caller, Requirement};

fn caller(sl: u16, flags: &str) -> Caller {
    Caller::new(sl, flags)
}
fn need(sl: u16, flags: &str) -> Requirement {
    Requirement::new(sl, flags)
}

#[test]
fn level_alone_gates_correctly() {
    assert!(may(&caller(20, ""), &need(20, "")));
    assert!(may(&caller(100, ""), &need(20, "")));
    assert!(!may(&caller(10, ""), &need(20, "")));
    assert!(!may(&caller(0, ""), &need(10, "")));
}

#[test]
fn flags_are_required_in_addition_to_level() {
    // A member whose gateway flag was revoked keeps their level and loses
    // the door. That is the whole point of having flags as well as levels:
    // a sanction that does not demote.
    assert!(may(&caller(20, "VG"), &need(20, "G")));
    assert!(!may(&caller(20, "V"), &need(20, "G")));
    // A higher level does not substitute for a missing flag.
    assert!(!may(&caller(100, ""), &need(20, "G")));
}

#[test]
fn all_required_flags_must_be_present() {
    assert!(may(&caller(20, "VGP"), &need(20, "GP")));
    assert!(!may(&caller(20, "VG"), &need(20, "GP")));
}

#[test]
fn flag_order_and_duplicates_do_not_matter() {
    assert!(may(&caller(20, "GVG"), &need(20, "VG")));
    assert!(may(&caller(20, "VG"), &need(20, "GV")));
}

#[test]
fn flags_are_case_sensitive_because_the_set_is_small_and_explicit() {
    assert!(!may(&caller(20, "g"), &need(20, "G")));
}

#[test]
fn the_twit_level_reads_and_does_nothing_else() {
    let twit = caller(level::TWIT, "");
    assert!(may(&twit, &need(level::TWIT, "")));
    assert!(!may(&twit, &need(level::GUEST, "")));
    assert!(!may(&twit, &need(level::MEMBER, "G")));
}

#[test]
fn the_documented_level_table_behaves_as_written() {
    let guest = caller(level::GUEST, "");
    let member = caller(level::MEMBER, "VG");
    let sysop = caller(level::SYSOP, "VGPS");

    let board = need(level::GUEST, "");
    let open_gateway = need(level::MEMBER, "G");
    let post = need(level::MEMBER, "P");
    let sysop_tools = need(level::SYSOP, "S");

    for c in [&guest, &member, &sysop] {
        assert!(may(c, &board), "everyone who is on can see the board");
    }
    assert!(!may(&guest, &open_gateway));
    assert!(may(&member, &open_gateway));
    assert!(may(&sysop, &open_gateway));

    assert!(!may(&guest, &post));
    assert!(
        !may(&member, &post),
        "posting needs the P flag, which is granted separately"
    );
    assert!(may(&sysop, &post));

    assert!(!may(&member, &sysop_tools));
    assert!(may(&sysop, &sysop_tools));
}

#[test]
fn authorisation_is_monotonic_in_level() {
    // Being promoted must never take something away.
    let r = need(level::GUEST, "");
    let mut last = false;
    for sl in [level::TWIT, level::GUEST, level::MEMBER, level::SYSOP] {
        let now = may(&caller(sl, ""), &r);
        assert!(now || !last, "level {sl} lost access a lower level had");
        last = now;
    }
}
