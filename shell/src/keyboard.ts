export type KeyHandler = (key: string) => void;

/// Normalises to what a board actually reads: a single uppercase
/// character, or one of the named keys.
export function onKey(handler: KeyHandler): () => void {
  const listener = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let key = e.key;
    if (key.length === 1) key = key.toUpperCase();
    if (["Enter", "Escape", "Backspace", " ", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
    }
    handler(key);
  };
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}
