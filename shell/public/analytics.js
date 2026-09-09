// Google Analytics 4 with Consent Mode v2, the same pattern as dbhq.uk.
//
// Denied by default. GA is not loaded and no cookie is set until the
// visitor accepts, so declining costs them nothing and the board behaves
// identically either way.
//
// External rather than inline so the board's CSP can stay strict. Inlining
// this would need script-src 'unsafe-inline', which re-opens the whole
// class of injection the policy exists to close - a poor trade for an
// analytics tag.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;
gtag("consent", "default", {
  ad_storage: "denied", analytics_storage: "denied",
  ad_user_data: "denied", ad_personalization: "denied",
});
var gaId = "G-3XEJ4F59YY";
var prod = location.hostname === "bbs.dbhq.uk";
window.__dbhqEnableGA = function () {
  if (!prod || window.__gaLoaded) return;
  window.__gaLoaded = true;
  gtag("consent", "update", { analytics_storage: "granted" });
  gtag("js", new Date());
  gtag("config", gaId);
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + gaId;
  document.head.appendChild(s);
};
try {
  if (localStorage.getItem("dbhq-consent") === "granted") window.__dbhqEnableGA();
} catch (e) {}
