<div align="center">

```
 ████████▄   ████████▄   ██      ██   ▄██████▄
 ██▀    ▀██  ██▀    ▀██  ██      ██  ██▀    ▀██
 ██      ██  ██     ▄██  ██      ██  ██      ██
 ██      ██  ████████▀   ██████████  ██      ██
 ██      ██  ██     ▀██  ██      ██  ██   ▄  ██
 ██▄    ▄██  ██▄    ▄██  ██      ██  ██▄  ▀█▄██
 ████████▀   ████████▀   ██      ██   ▀██████▀
                                            ▀██
```

# bbs

**The world wide web, as a bulletin board.**

[bbs.dbhq.uk](https://bbs.dbhq.uk) &nbsp;·&nbsp; 1992 hardware rules, 2026 outside

</div>

---

Type a URL. It comes back as a 1992 bulletin board: numbered menus, ANSI colour, CP437, and the pictures redrawn as block art.

It is not a browser with a retro skin on it. The page is taken apart into a semantic model, the navigation furniture is thrown away, and what is left is rebuilt as a board. Everything you see is 80 columns by 25 rows of the IBM VGA character set in sixteen colours, and nothing else, because that is all a board had.

## Why it exists

Every text browser ever written reproduces a *page*. `lynx` and `w3m` scrape tags. [browsh](https://www.brow.sh/) streams a pixel downsample of headless Firefox. [Carbonyl](https://github.com/fathyb/carbonyl) renders Chromium into a terminal.

This reproduces a **board**. The page's semantic structure is the render source, and the BBS is the presentation grammar: a numbered list of things worth reading, in a place you log on to.

It is an experiment, not a business. It is judged on being singular, not on repeat value.

## What it does

- Fetches any URL through a hardened Cloudflare relay
- Derives an ARIA-informed semantic model from the HTML the server actually sent
- Throws away duplicated navigation, cookie banners, language pickers and boilerplate
- Lays the rest out in 80 columns and folds it into CP437
- Converts images to CP437 block art in sixteen colours
- Presents it all as a board with conferences, a login and a metering banner

Conferences read live from Hacker News, Wikipedia and GitHub. The `W) WORLD WIDE WEB GATEWAY` door is where you type an address.

## How it is put together

```
  browser                                    Cloudflare              the web
  ┌──────────────────────────────┐          ┌──────────────┐
  │ shell (TypeScript)           │          │ Pages        │
  │  DOMParser  ─┐               │          │ Function     │
  │  canvas     ─┤               │  POST    │  /gw/*       │  GET
  │              ▼               │ ───────► │              │ ─────►  target
  │  ┌────────────────────────┐  │          │  relay only  │         site
  │  │ core (Rust → WASM)     │  │ ◄─────── │              │ ◄─────
  │  │  semantic projection   │  │  bytes   └──────────────┘
  │  │  chrome rejection      │  │
  │  │  80-column layout      │  │
  │  │  CP437 / ANSI          │  │
  │  │  pixel → glyph         │  │
  │  └────────────────────────┘  │
  │         ▼                    │
  │  terminal canvas             │
  └──────────────────────────────┘
```

| Unit | Language | Job |
|---|---|---|
| `core/` | Rust to WASM | Every interesting decision. No network, no DOM, no browser API |
| `shell/` | TypeScript | The canvas, the keyboard, and the two jobs handed to the browser |
| `functions/` | TypeScript | A relay that fetches a URL and returns bytes. Knows nothing about HTML or BBSes |

**The back-end returns data, never presentation.** All rendering happens in the WASM core. The Worker authenticates, authorises and relays bytes; it never returns a screen, a line of ANSI or a CP437 byte. The rule exists so the core stays testable as a pure function and remains the single source of what the board looks like.

**The browser does the parsing and the image decoding**, because it already contains a better HTML parser and better codecs than anything worth bundling. `DOMParser` output is inert - no scripts run, no subresources are fetched. What is left for Rust is the part that is actually computation.

## The interesting problems

Four things here were harder than they look, and each one is documented in the source where it bites.

### Turning a photograph into sixteen colours

The first version was unrecognisable, and four separate bugs were why.

The colour pair came from the glyph's own partition, so on a flat cell foreground and background quantised to the *same* palette entry and a blend was never proposed - the shade glyphs were structurally unreachable. Colours were matched by nearest neighbour in sRGB, which is not perceptual, so desaturated mid-tones landed on saturated entries. Downsampling averaged gamma-encoded values, which darkens every mixture. And the error metric was per-pixel only, which charges a dot lattice for its variance, so a solid block beat every blend.

It now searches **all 240 ordered palette pairs** against the whole font, in **Oklab**, in **linear light**, scoring a filtered tonal term against a native structural one. Local contrast is applied first, because a face's internal variation is smaller than the gap between palette entries and the whole face otherwise posterises flat.

Proved along the way: at 200 columns, four times the cells, the eyes were *still* missing before those fixes. Resolution was never the limit.

### Chrome rejection is the product

Without a CSS cascade you cannot tell which of a page's two navigation menus is hidden, whether an accordion is closed, or whether a cookie banner was dismissed. The naive projection of a real page is a wall of duplicated navigation with the article somewhere underneath.

So the discarding is the point. Duplicate menus are found by comparing consecutive link *runs* by destination, which tolerates the icon-vs-no-icon label differences that exact matching misses. A long run of links appearing before any prose is navigation - Wikipedia's twenty-language sidebar was page one of every article until that rule existed.

### CP437 is a real constraint, not a filter

The font is generated by [`core/assets/gen_font.py`](core/assets/gen_font.py) rather than downloaded, so the block and line-drawing glyphs are geometrically exact. In an 8x16 cell `▀` and `▄` are 8x8 squares but `▌` and `▐` are 4x16 strips - they are not interchangeable drawing units.

Text that CP437 cannot represent is dropped rather than shown as a row of question marks. Smart quotes, dashes and ellipses are folded rather than lost.

### The relay is bounded, not authenticated

You cannot prove a request came from your own WASM. The web has no hardware-rooted "this exact binary" primitive, and any scheme that looks like one is defeated by generating a key outside the browser and enrolling it once.

So the capability is bounded instead: GET only, scheme and port must agree, redirects re-validated at every hop, byte caps enforced while reading and not just from the header, no caller cookies forwarded, private address literals refused. The relay sends **no** `Access-Control-Allow-Origin` at all and requires a non-safelisted header, so a cross-origin preflight fails and the request never fires.

## Running it

```bash
rustup target add wasm32-unknown-unknown
curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh

wasm-pack build core --target web --release
cd shell && npm ci && npm run build && cd ..
npx wrangler dev --port 8788 --ip 100.115.72.85
```

`wrangler dev` reads `wrangler.toml`, so it serves the built shell and the
Worker together with the same bindings production has. Deploy with
`npx wrangler deploy` - the board is a Worker with static assets, not a Pages
project, because a Pages project cannot hold the atomic rate-limit bindings
the gateway depends on.

**Toolchain note.** wasm-pack 0.13.1 bundles a `wasm-opt` predating the bulk-memory proposal, while Rust 1.98 emits `memory.fill` by default. The build fails with `error validating input` unless `wasm-opt` is passed `--enable-bulk-memory`, which `core/Cargo.toml` does. Setting `wasm-opt = false` also builds but silently forfeits the size optimisation.

## Testing

```bash
cargo test --manifest-path core/Cargo.toml   # the core, as pure functions
npx vitest run test/                          # the relay, incl. adversarial cases
cd shell && npx vitest run                    # the shell
```

The relay suite is adversarial on purpose: redirect loops, redirects into private address space, honest and dishonest oversized bodies, decompression bombs, content-type escapes, and header forwarding.

## Payload

The reason the decoders stay in the browser:

| Build | Raw | Gzipped |
|---|---|---|
| Full pipeline | 143,898 B | ~64 KB |

CI fails above 250 KB gzipped, to catch anyone accidentally pulling in `html5ever` or the `image` crate.

## What it does not do

Recorded so it is not re-proposed. The reasoning is in the spec's *"What died, and why"* table.

- **It is not fully client-side.** The same-origin policy makes that impossible; a page cannot `fetch()` an arbitrary third-party site
- **It does not strip JavaScript.** It only ever sees what the server sent, so a single-page app is an empty shell. The honest name is a semantic projection of server-delivered HTML
- **It makes no accessibility-fidelity claim.** The computed accessibility tree needs CDP. This derives an ARIA-informed model and is a reading surface, not an audit tool
- **It is not a faithful low-contrast portrait medium.** CP437 at 80 columns is strong on silhouettes, pose, hair masses, clothing boundaries, high-contrast subjects and logos

## Design

Specs and plans live in the [DBHQ repo](https://github.com/dbhq-uk/dbhq) under `docs/superpowers/`:

| Doc | What |
|---|---|
| `2026-09-08-bbs-design.md` | Spec 1: the renderer, shipped |
| `2026-09-08-bbs-accounts-design.md` | Spec 2: accounts, security levels, the gate |
| `2026-09-08-bbs-community-design.md` | Spec 3: message bases, mail, presence |

Read spec 1's *"What died, and why"* before proposing that any of it be reinstated.

## Prior art and thanks

[chafa](https://hpjansson.org/chafa/) is the reference-quality terminal graphics library and the source of the structural-glyph-matching and perceptual-colour approach. Jason Scott's [ANSI art archive](http://artscene.textfiles.com/ansi/) preserves the welcome screens this is trying to live up to. The access model - a security level per user, with every gated thing declaring what it needs - is lifted wholesale from WWIV (1984) by way of Telegard, Renegade, Synchronet and Mystic.

FidoNet, incidentally, is still alive: the nodelist is published weekly. It cannot run here, because BinkP needs a long-lived inbound TCP listener and Workers speak HTTP.

---

<div align="center">

A [DBHQ](https://dbhq.uk) experiment &nbsp;·&nbsp; MIT

</div>
