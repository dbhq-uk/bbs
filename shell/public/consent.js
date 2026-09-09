// The consent prompt.
//
// A native <dialog> opened with showModal(), so the browser supplies focus
// move-in, a focus trap, Escape handling and focus return. A hand-rolled
// overlay has none of those.
(function () {
  var dlg = document.querySelector("[data-consent]");
  if (!dlg) return;
  var choice = null;
  try { choice = localStorage.getItem("dbhq-consent"); } catch (e) {}
  function set(v) {
    try { localStorage.setItem("dbhq-consent", v); } catch (e) {}
    if (dlg.open) dlg.close();
    if (v === "granted" && typeof window.__dbhqEnableGA === "function") {
      window.__dbhqEnableGA();
    }
  }
  dlg.querySelector("[data-consent-accept]").addEventListener("click", function () { set("granted"); });
  dlg.querySelector("[data-consent-decline]").addEventListener("click", function () { set("denied"); });
  // Only ask if they have not already answered. Escape counts as no
  // answer, so the prompt returns next visit rather than being treated
  // as consent.
  if (choice !== "granted" && choice !== "denied") dlg.showModal();
})();
