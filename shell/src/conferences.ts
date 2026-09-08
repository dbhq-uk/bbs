export type Conference = {
  id: string;
  key: string;
  name: string;
  /// A source that already sends permissive CORS headers needs no gateway.
  /// Measured 8 Sep 2026 - see the spec's "What died" table.
  direct: boolean;
  url: string;
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
  },
  {
    id: "wiki",
    key: "2",
    name: "WIKIPEDIA - RANDOM",
    direct: true,
    url: "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=random&grnnamespace=0&grnlimit=20",
  },
  {
    id: "gh",
    key: "3",
    name: "GITHUB - DBHQ",
    direct: true,
    url: "https://api.github.com/orgs/dbhq-uk/repos?per_page=30",
  },
];
