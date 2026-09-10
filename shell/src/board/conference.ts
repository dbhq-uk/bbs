import { gwFetch } from "../gw";
import type { Conference } from "../conferences";
import type { Item } from "./screens";

/// A conference is a list of items. Sources that already send permissive
/// CORS headers are fetched directly; anything else goes via the relay.
export async function loadConference(c: Conference): Promise<Item[]> {
  const raw = c.direct
    ? await (await fetch(c.url)).text()
    : await (async () => {
        const r = await gwFetch(c.url);
        if (!r.ok) throw new Error(r.reason);
        return new TextDecoder().decode(r.bytes);
      })();

  // A relayed conference arrives as HTML, not JSON: the listing is the
  // page's own links. Keyed on `direct` rather than on an id, because the
  // distinction is genuinely "did this come from a JSON API or a web page",
  // and hardcoding ids meant every new HTML source fell through to
  // JSON.parse and threw.
  if (!c.direct) {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const byHref = new Map<string, string>();
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
      const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length > 18 && !byHref.has(href)) byHref.set(href, text);
    }
    return [...byHref.entries()]
      .slice(0, 40)
      .map(([href, title]) => ({
        title,
        // Relative hrefs resolve against the conference's own URL.
        url: new URL(href, c.url).toString(),
      }));
  }

  const data = JSON.parse(raw);
  switch (c.id) {
    case "hn":
      return resolveHn((data as number[]).slice(0, 24));
    case "gh":
      return (data as { name: string; html_url: string; description: string | null }[]).map(
        (r) => ({
          title: `${r.name}${r.description ? " - " + r.description : ""}`,
          url: r.html_url,
        }),
      );
    case "wiki": {
      const pages = (data as {
        query: { pages: Record<string, { title: string }> };
      }).query.pages;
      return Object.values(pages).map((p) => ({
        title: p.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
      }));
    }
    default:
      return [];
  }
}

async function resolveHn(ids: number[]): Promise<Item[]> {
  const items = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return r.json() as Promise<{ title?: string; url?: string; id: number }>;
    }),
  );
  // THE THREAD, NOT THE STORY, and for everyone rather than only for
  // guests.
  //
  // `i.url` is where the story lives - Ars Technica, someone's blog,
  // anywhere at all - so a guest opening item 3 was refused by the gate
  // for a host no allowlist could reasonably carry. Only a story with no
  // external link ever fell back to the permalink, which is on the list,
  // so the conference read as broken rather than as gated.
  //
  // Pointing every item at the discussion fixes that and is the better
  // board anyway: a message base shows you the thread, and the thread
  // links out. A member who wants the article pastes it into the W door.
  return items
    .filter((i) => i.title)
    .map((i) => ({
      title: i.title!,
      url: `https://news.ycombinator.com/item?id=${i.id}`,
    }));
}
