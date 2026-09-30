// The analytics notice. Analytics is on by default under the PECR
// statistical-purposes exception, which needs clear information and a simple,
// free way to object - not prior consent. So this informs and offers "Opt out";
// it does not ask. It replaced a modal Accept/Decline <dialog> on 30 Sep 2026.
//
// NON-MODAL ON PURPOSE. There is nothing to agree to before reading, so it must
// not block the board. "Opt out" is drawn exactly like "OK" - objecting is no
// harder than carrying on. The footer's "Cookie settings" reopens it. The
// behaviour lives in analytics.js (window.dbhqAnalytics), which must load
// first.
(function () {
  var box = document.querySelector("[data-analytics-notice]");
  var api = window.dbhqAnalytics;
  if (!box || !api) return;
  var status = box.querySelector("[data-analytics-status]");
  var on = box.querySelector("[data-analytics-on]");
  var off = box.querySelector("[data-analytics-off]");
  var returnTo = null;

  function show(reopened) {
    var choice = api.choice();
    status.hidden = !reopened;
    status.textContent = choice === "off" ? "Analytics is off in this browser." : "Analytics is on in this browser.";
    on.textContent = choice === "off" ? "Turn back on" : "OK";
    box.hidden = false;
    if (reopened) box.focus();
  }
  function hide() {
    box.hidden = true;
    if (returnTo) { returnTo.focus(); returnTo = null; }
  }

  on.addEventListener("click", function () { api.keepOn(); hide(); });
  off.addEventListener("click", function () { api.optOut(); hide(); });
  box.addEventListener("keydown", function (e) {
    // Escape closes a reopened notice without changing anything. A first-visit
    // notice stays until answered, so it is not dismissed by a stray key.
    if (e.key === "Escape" && api.choice()) hide();
    // Keys pressed inside the notice belong to the notice. The board listens
    // on window and cancels Enter and Space, which would stop them pressing
    // these buttons, and would also act on the board behind it.
    e.stopPropagation();
  });

  // "Cookie settings" controls are hidden until this script runs, so a
  // visitor without JavaScript - who gets no analytics either - is not shown
  // a button that does nothing.
  document.querySelectorAll("[data-analytics-settings]").forEach(function (b) {
    b.hidden = false;
    b.addEventListener("click", function () { returnTo = b; show(true); });
  });

  if (!api.choice()) show(false);
})();
