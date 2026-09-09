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
//
// The measurement ID is the estate-wide one, deliberately: every *.dbhq.uk
// site reports to the single "DBHQ" stream on property 544327698. It used
// to be G-3XEJ4F59YY, a stream of its own, which gave the board a second
// _ga_<id> cookie on the shared .dbhq.uk parent - so a visitor arriving
// from dbhq.uk started a fresh session here and the journey between the
// two was lost. One stream also matters for Search Console: that link
// binds to exactly one data stream, so a site on its own ID can never show
// search data in GA4. Split the sites at reporting time with the Hostname
// dimension instead. See dbhq/docs/reference/analytics.md.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;
gtag("consent", "default", {
  ad_storage: "denied", analytics_storage: "denied",
  ad_user_data: "denied", ad_personalization: "denied",
});
var gaId = "G-3H3NFGSX85";
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
