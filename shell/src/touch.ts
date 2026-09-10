/// Touch and pointer input for the board.
///
/// The board's key vocabulary does not change here. Every gesture resolves
/// to one of the keys handleKey already reads, so nothing downstream knows
/// a phone is involved.

/// A row that can be tapped, and what tapping it presses.
///
/// `keys` is a sequence rather than a single key because a conference item
/// is reached by typing its number and pressing return - tapping item 12
/// feeds "1", "2", "Enter", which is exactly what a caller would type.
export type Hot = { row: number; keys: string[] };

/// Which board row a pointer landed on, or null if it missed the canvas.
///
/// The canvas is scaled by CSS while its backing store stays at the mode's
/// native size, so this has to divide the CSS box rather than use any
/// pixel dimension.
export function rowAt(
  rect: { left: number; top: number; width: number; height: number },
  clientY: number,
  rows: number,
): number | null {
  if (rect.height <= 0) return null;
  const y = clientY - rect.top;
  if (y < 0 || y >= rect.height) return null;
  return Math.floor((y / rect.height) * rows);
}

/// What a tap on that row should press, or null for a row that is not a
/// control. Most of the screen is not.
export function keysAt(hot: Hot[], row: number | null): string[] | null {
  if (row === null) return null;
  return hot.find((h) => h.row === row)?.keys ?? null;
}

/// Minimum horizontal travel before a drag counts as a page turn, in CSS
/// pixels. Below this a tap with a shaky thumb would page the document.
const SWIPE_MIN = 48;

/// A swipe must be more horizontal than vertical, or scrolling a long
/// screen turns pages by accident.
export function classifySwipe(dx: number, dy: number): "N" | "P" | null {
  if (Math.abs(dx) < SWIPE_MIN) return null;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  // Dragging left pulls the next page in, the way turning a page works.
  return dx < 0 ? "N" : "P";
}

/// The screens that need real typing, and what the keyboard should be for.
///
/// A single hidden input serves all of them, but its type has to change:
/// inputmode="url" gets the phone's URL keyboard with a visible slash and
/// no autocapitalisation, and type="password" is what lets a password
/// manager offer to fill and to save.
export type TextKind = "url" | "text" | "password" | null;

/// Builds the off-screen input that summons the OS keyboard.
///
/// NOT display:none and not hidden - neither can take focus, and an input
/// that cannot take focus never raises a keyboard. It is positioned out of
/// the way and made invisible instead.
export function makeHiddenInput(doc: Document): HTMLInputElement {
  const el = doc.createElement("input");
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.autocapitalize = "off";
  el.autocomplete = "off";
  el.spellcheck = false;
  el.style.cssText =
    "position:fixed;left:0;bottom:0;width:1px;height:1px;padding:0;border:0;" +
    "opacity:0;background:transparent;color:transparent;caret-color:transparent;" +
    "font-size:16px;z-index:-1";
  return el;
}

/// iOS zooms the page when a focused input has a font smaller than 16px, so
/// the style above pins it. Recorded here because it looks like dead style
/// and is not.
export function focusFor(el: HTMLInputElement, kind: Exclude<TextKind, null>) {
  el.type = kind === "password" ? "password" : "text";
  el.inputMode = kind === "url" ? "url" : "text";
  el.value = "";
  el.focus({ preventScroll: true });
}

/// Wires the canvas and the hidden input to a key handler.
///
/// Returns a controller rather than nothing, because the shell has to tell
/// it two things it cannot work out for itself: which rows are currently
/// tappable, and whether the screen on display wants a keyboard.
export function attachTouch(opts: {
  canvas: HTMLCanvasElement;
  input: HTMLInputElement;
  rows: () => number;
  hot: () => Hot[];
  swipeable: () => boolean;
  onKeys: (keys: string[]) => void;
}) {
  const { canvas, input, rows, hot, swipeable, onKeys } = opts;

  let downX = 0;
  let downY = 0;
  let downAt = 0;

  canvas.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downAt = Date.now();
  });

  canvas.addEventListener("pointerup", (e) => {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;

    if (swipeable()) {
      const swipe = classifySwipe(dx, dy);
      if (swipe) return onKeys([swipe]);
    }

    // Anything that travelled is a drag, not a tap, even on a screen with
    // nothing to swipe. A tap that moved 40px was aimed at something else.
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    if (Date.now() - downAt > 700) return; // a long press is not a keystroke

    const keys = keysAt(hot(), rowAt(canvas.getBoundingClientRect(), e.clientY, rows()));
    if (keys) onKeys(keys);
  });

  // Characters are passed through as typed - see onKey in keyboard.ts for
  // why folding case at the input is wrong. Pasting a URL is the clearest
  // case: uppercasing it on the way in breaks every mixed-case path.
  //
  // Characters come from beforeinput, not keydown.
  //
  // A soft keyboard reports keydown with keyCode 229 and no useful key for
  // ordinary characters, and does not reliably fire keydown for backspace
  // at all. beforeinput reports both, on every mobile browser, and naming
  // the intent (`deleteContentBackward`) rather than the key is what makes
  // it work without knowing which keyboard is installed.
  //
  // Every one is prevented: the board draws the text itself, and letting
  // the input hold a value would put a second, invisible copy of it one
  // keystroke out of step.
  input.addEventListener("beforeinput", (e) => {
    const ev = e as InputEvent;
    ev.preventDefault();
    switch (ev.inputType) {
      case "insertText":
        if (ev.data) onKeys([...ev.data]);
        return;
      case "insertLineBreak":
        return onKeys(["Enter"]);
      case "deleteContentBackward":
        return onKeys(["Backspace"]);
      case "insertFromPaste": {
        const text = ev.dataTransfer?.getData("text") ?? ev.data ?? "";
        if (text) onKeys([...text]);
        return;
      }
    }
  });

  // A hardware keyboard on a tablet still sends these properly, and the
  // named keys never arrive as beforeinput.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      onKeys([e.key]);
    }
  });
}
