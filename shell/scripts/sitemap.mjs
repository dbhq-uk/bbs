// Generates public/sitemap.xml with a real <lastmod> per page.
//
// The file used to be static and carried no <lastmod> at all, which left
// Google without the one sitemap hint it still acts on - it has said it
// largely disregards changefreq and priority.
//
// Hand-writing the dates would have been worse than leaving them out. A stale
// lastmod is a claim Google checks, catches out, and then discounts for the
// whole site, so a date nobody remembers to update is an actively negative
// signal. Generating it from git is the only version that stays true.
//
// WHY NOT THE BUILD TIMESTAMP: it would move all three dates on every deploy,
// which tells a crawler nothing except that the site was rebuilt.
//
// Run by `npm run build` before vite, so public/sitemap.xml is current in the
// output. Requires full git history - on a shallow clone every page resolves
// to the deploy commit, so this throws instead of publishing three identical
// dates.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHELL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SHELL, "..");

// loc, the source file behind it, and the crawl hints carried over verbatim
// from the hand-written file.
const PAGES = [
  {
    loc: "https://bbs.dbhq.uk/",
    source: "shell/index.html",
    changefreq: "weekly",
    priority: "1.0",
    // The board. Every screen is drawn to a canvas, so it has no crawlable
    // prose of its own; /about/ carries that and is linked from the header.
  },
  {
    loc: "https://bbs.dbhq.uk/ascii-art-generator/",
    source: "shell/ascii-art-generator/index.html",
    changefreq: "monthly",
    priority: "0.9",
    // Its own URL because it has to be findable: image-to-ASCII is roughly
    // 95,000 searches a month worldwide against a few hundred for BBS terms.
  },
  {
    loc: "https://bbs.dbhq.uk/about/",
    source: "shell/about/index.html",
    changefreq: "monthly",
    priority: "0.7",
  },
];

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" });

if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
  throw new Error(
    "sitemap: shallow clone, so every page would carry the deploy date. " +
      "Check out with fetch-depth: 0.",
  );
}

const body = PAGES.map(({ loc, source, changefreq, priority }) => {
  const stamp = git(["log", "-1", "--format=%cI", "--", source]).trim();
  const lastmod = stamp ? `\n    <lastmod>${stamp.slice(0, 10)}</lastmod>` : "";
  return `  <url>
    <loc>${loc}</loc>${lastmod}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}).join("\n");

writeFileSync(
  resolve(SHELL, "public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`,
);

console.log(`sitemap: ${PAGES.length} URLs written with git dates`);
