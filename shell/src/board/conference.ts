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
  return items
    .filter((i) => i.title)
    .map((i) => ({
      title: i.title!,
      url: i.url ?? `https://news.ycombinator.com/item?id=${i.id}`,
    }));
}
