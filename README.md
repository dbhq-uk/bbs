# bbs

A bulletin board that fronts the live web. Numbered menus, ANSI colour, and images drawn as CP437 art.

Live at [bbs.dbhq.uk](https://bbs.dbhq.uk). A DBHQ experiment.

## What it is

Fetches a page, derives an ARIA-informed semantic projection from the HTML the server actually sent, throws away the navigation furniture, and renders what is left as a 1992 bulletin board.

It is **not** a browser, and it makes **no claim about accessibility fidelity**. It is a reading surface.

## How it is put together

| Unit | Language | Job |
|---|---|---|
| `core/` | Rust to WASM | Semantic projection, chrome rejection, 80-column layout, CP437 quantisation. No network, no DOM |
| `shell/` | TypeScript | Canvas terminal, keyboard, and the two jobs handed to the browser: `DOMParser` and `createImageBitmap` |
| `functions/` | TypeScript | A Cloudflare Pages Function that fetches a URL and returns bytes. Knows nothing about HTML or BBSes |

The browser parses the HTML and decodes the images, because it already contains a better parser and better codecs than anything worth bundling. What is left for Rust is the part that is actually computation.

## Payload

The reason the decoders stay in the browser. Measured on this machine:

| Build | Raw | Gzipped | Date |
|---|---|---|---|
| Empty crate baseline | 13,920 B | 6,266 B | 8 Sep 2026 |

CI fails the build if the gzipped artifact exceeds 250 KB. That ceiling exists to catch someone accidentally pulling in `html5ever` or the `image` crate, which is the one mistake that would quietly undo the language decision.

## Building

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
wasm-pack build core --target web --release
cd shell && npm ci && npm run build
```

**Toolchain note.** wasm-pack 0.13.1 bundles a `wasm-opt` that predates the bulk-memory proposal, while Rust 1.98 emits `memory.fill` by default. The build fails with `error validating input` unless `wasm-opt` is passed `--enable-bulk-memory`, which `core/Cargo.toml` does. Setting `wasm-opt = false` also builds, but silently forfeits the size optimisation the budget above assumes.

## Testing

```bash
cargo test --manifest-path core/Cargo.toml   # the core, as pure functions
npx vitest run test/                          # the relay, including adversarial cases
cd shell && npx vitest run                    # the shell
npx playwright test                           # the end-to-end walk
```

## Design

The spec and the implementation plan live in the DBHQ repo:

- `docs/superpowers/specs/2026-09-08-bbs-design.md`
- `docs/superpowers/plans/2026-09-08-bbs.md`

Read the spec's "What died, and why" table before proposing that any of it be reinstated.
