export type Conference = {
  id: string;
  key: string;
  name: string;
  /// A source that already sends permissive CORS headers needs no gateway.
  /// Measured 8 Sep 2026 - see the spec's "What died" table.
  direct: boolean;
  url: string;
  /// WHERE A READER LANDS when they open an item from this conference,
  /// which is a different host from `url` on three of the four.
  ///
  /// Declared rather than inferred, because the gate refuses by host and
  /// nothing in either file could see the mismatch. `url` was already
  /// checked against the allowlist; the destination was not, and GITHUB -
  /// DBHQ was entirely dead for guests as a result - api.github.com was
  /// listed and github.com, where every item actually goes, was not.
  destination: string;
};

/// The starting set: sources measured to send Access-Control-Allow-Origin,
/// so the front door works even if the gateway is rate-limited or down.
export const CONFERENCES: Conference[] = [
  {
    id: "hn",
    key: "1",
    name: "HACKER NEWS",
    direct: true,
    url: "https://hacker-news.firebaseio.com/v0/topstories.json",
    // The thread, not the story. A story links anywhere on the web, so no
    // allowlist can cover it - see resolveHn.
    destination: "https://news.ycombinator.com/",
  },
  {
    id: "wiki",
    key: "2",
    name: "WIKIPEDIA - RANDOM",
    direct: true,
    url: "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=random&grnnamespace=0&grnlimit=20",
    destination: "https://en.wikipedia.org/",
  },
  {
    // BBC News has no permissive-CORS API, so it goes through the relay
    // like any other site. The front page is a list of story cards, which
    // is exactly what a message base looks like.
    id: "bbc",
    key: "3",
    name: "BBC NEWS",
    direct: false,
    url: "https://www.bbc.co.uk/news",
    // The only conference whose items stay on the host they came from.
    destination: "https://www.bbc.co.uk/",
  },
  {
    id: "gh",
    key: "4",
    name: "GITHUB - DBHQ",
    direct: true,
    url: "https://api.github.com/orgs/dbhq-uk/repos?per_page=30",
    // html_url, which is github.com - not the api.github.com the feed
    // is read from.
    destination: "https://github.com/",
  },
];
