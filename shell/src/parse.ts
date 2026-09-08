/// Attributes the projection reads. Everything else is dropped at the
/// boundary so the JSON crossing into WASM stays small, and so tracking
/// attributes and event handlers never reach the core at all.
const KEEP = new Set([
  "id", "role", "href", "src", "alt", "title", "hidden", "style", "lang",
  "aria-label", "aria-labelledby", "aria-hidden", "aria-describedby",
  "colspan", "rowspan", "type", "value", "for", "name",
]);

type RawNode = {
  tag: string;
  text?: string;
  attrs?: [string, string][];
  children?: RawNode[];
};

/// Parses HTML with the browser's own parser and serialises the result.
///
/// DOMParser output is inert by construction: scripts do not run and
/// subresources are not fetched. That is why the spec hands parsing to the
/// browser rather than bundling a second parser into the WASM payload.
export function toRawNode(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return JSON.stringify(serialise(doc.documentElement));
}

function serialise(node: Node): RawNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return { tag: "", text: node.textContent ?? "" };
  }

  const el = node as Element;
  const attrs: [string, string][] = [];
  for (const a of Array.from(el.attributes ?? [])) {
    const name = a.name.toLowerCase();
    if (KEEP.has(name)) attrs.push([name, a.value]);
  }

  const children: RawNode[] = [];
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === Node.TEXT_NODE) {
      const t = c.textContent ?? "";
      if (t.trim() === "") continue;
      children.push({ tag: "", text: t });
    } else if (c.nodeType === Node.ELEMENT_NODE) {
      children.push(serialise(c));
    }
  }

  const out: RawNode = { tag: el.tagName.toLowerCase() };
  if (attrs.length) out.attrs = attrs;
  if (children.length) out.children = children;
  return out;
}
