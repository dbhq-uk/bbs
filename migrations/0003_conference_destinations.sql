-- GITHUB - DBHQ was entirely dead for guests, and the test that exists to
-- catch exactly this could not see it.
--
-- 0002 separated "somewhere a guest may VISIT" from "a host a guest may
-- REACH", and put the two feed hosts on the second list. It checked the
-- wrong end of the journey. A conference has two hosts, not one: the feed
-- it is READ from, and the place an item SENDS you. Those differ on three
-- of the four conferences, and only the feed was ever compared against the
-- allowlist.
--
-- So api.github.com was reachable and github.com was not, while every item
-- in that conference is an html_url on github.com. Pressing 4 listed the
-- repositories perfectly and opening any one of them returned
-- `members_only`.
--
-- Reachable, not listed, for the same reason as the feeds in 0002: an item
-- points here, but the curated menu of places worth visiting is a
-- different, shorter list.
-- Guarded, because `sites` has no unique constraint on url.
--
-- This was written when it could not rely on being run exactly once: the
-- live schema had been built by hand and d1_migrations was empty, so
-- `wrangler d1 migrations list` reported every migration as pending and
-- running the runner would have re-executed 0001's DDL and duplicated
-- 0002's inserts. The ledger was backfilled on 15 Sep 2026 and the runner
-- is usable again, so a new migration no longer has to be idempotent.
--
-- The guard stays here anyway. It costs nothing, and this file has already
-- been applied by hand more than once.
INSERT INTO sites (name, url, sort, listed)
SELECT 'GitHub', 'https://github.com/', 120, 0
WHERE NOT EXISTS (SELECT 1 FROM sites WHERE url = 'https://github.com/');

-- Hacker News needs no row. Its items now point at the discussion thread on
-- news.ycombinator.com, which has been listed since 0001 - see resolveHn in
-- shell/src/board/conference.ts for why the story's own URL could never
-- have been allowlisted.
