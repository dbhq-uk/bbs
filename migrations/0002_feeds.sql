-- The board's own conferences were unreachable for guests.
--
-- `sites` was doing two jobs at once: it is the menu of places a guest may
-- VISIT, and it is also the allowlist of hosts a guest may REACH. Those are
-- not the same set. Every conference on the main menu is built from an API
-- on a different host to the site a reader would recognise - Hacker News
-- reads hacker-news.firebaseio.com, not news.ycombinator.com - so pressing
-- 1 on the main menu returned `members_only` to every guest.
--
-- Putting the API hosts on the menu would fix the reach and break the menu:
-- "hacker-news.firebaseio.com" is not somewhere anyone wants to visit. So
-- the two jobs get separated instead, with one allowlist and a flag saying
-- which entries are worth showing.
ALTER TABLE sites ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;

-- Reachable, not listed: these are the board's own feeds, and their sort
-- order only decides tie-breaks since nothing displays them.
INSERT INTO sites (name, url, sort, listed) VALUES
  ('Hacker News API', 'https://hacker-news.firebaseio.com/', 100, 0),
  ('GitHub API',      'https://api.github.com/',             110, 0);
