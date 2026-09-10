export type KeyHandler = (key: string) => void;

/// Normalises to what a board actually reads: a single character as typed,
/// or one of the named keys.
///
/// THE CASE IS NOT FOLDED HERE ANY MORE, and that was not cosmetic.
///
/// This uppercased every single character on the way in, before anything
/// knew whether it was a command or a character in a text field. The board's
/// commands genuinely are case-insensitive, so it looked harmless, and it
/// silently broke the two places that take real text.
///
/// Every password was stored uppercased - self-consistent, so logging on
/// worked, but throwing away the case bits and guaranteeing a mismatch with
/// anything a password manager had saved. And a URL typed at the W door was
/// uppercased whole: a hostname does not care, a PATH does, so any address
/// with a mixed-case path fetched something that was not there.
///
/// Folding now happens where a key is COMPARED to a command, in main.ts,
/// which is the only place that has the context to know the difference.
/// The key as a COMMAND: a single character folds case, a named key does
/// not. Exported so the fold has one definition and can be tested, rather
/// than being an expression buried in a handler.
export function asCommand(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

export function onKey(handler: KeyHandler): () => void {
  const listener = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (["Enter", "Escape", "Backspace", " ", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
    }
    handler(e.key);
  };
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}
