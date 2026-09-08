// Runs the real pipeline over a captured page and reports what survives.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

const { toRawNode } = await import("../shell/src/parse.ts");
const wasm = await import("../core/pkg/bbs_core.js");
await wasm.default(readFileSync("core/pkg/bbs_core_bg.wasm"));

const html = readFileSync(process.argv[2], "utf8");
const raw = toRawNode(html);
console.log("RawNode JSON:", (raw.length / 1024).toFixed(0), "KB");

const r = wasm.render_document(raw, 80, 23);
console.log("title:", JSON.stringify(r.title));
console.log("blocks in -> out:", r.blocks_in, "->", r.blocks_out);
console.log("empty shell:", r.empty_shell);
console.log("pages:", r.pages.length);
console.log("links:", r.links.length);
console.log("images:", r.image_count);
console.log("blocks before first prose:", r.blocks_before_first_prose);
if (r.images.length) console.log("first images:", r.images.slice(0, 3));
