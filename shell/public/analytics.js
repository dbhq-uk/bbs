// Google Analytics 4, on by default with a notice and a simple opt-out - the
// same pattern as every *.dbhq.uk site. See dbhq/docs/reference/analytics.md,
// "Analytics notice and opt-out".
//
// Analytics runs without prior consent under the PECR statistical-purposes
// exception: statistics only, aggregate output, Google as a processor, and a
// clear notice with a free way to object. So the ad signals are denied and
// Signals and ad personalisation are off in the config. This replaced an
// opt-in Accept/Decline prompt on 30 Sep 2026.
//
// This file is the gate: it decides whether GA4 loads and defines
// window.dbhqAnalytics, which the notice in consent.js drives. It must load
// before consent.js.
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
// dimension instead.
(function () {
  var gaId = "G-3H3NFGSX85";
  // Only the live host. Never localhost or workers.dev.
  var prod = location.hostname === "bbs.dbhq.uk";

  // The choice is a cookie on .dbhq.uk, so opting out on one site opts
  // out on every *.dbhq.uk site - the _ga cookie is estate-wide too.
  // A localStorage "dbhq-consent" left by the old opt-in prompt is read
  // once and carried over: "denied" stays an opt-out.
  function readChoice() {
    var m = document.cookie.match(/(?:^|; )dbhq_analytics=(on|off)(?:;|$)/);
    if (m) return m[1];
    try {
      var old = localStorage.getItem("dbhq-consent");
      if (old === "denied") return "off";
      if (old === "granted") return "on";
    } catch (e) {}
    return null;
  }
  function writeChoice(v) {
    var c = "dbhq_analytics=" + v + "; Max-Age=31536000; Path=/; SameSite=Lax; Secure";
    if (/(^|\.)dbhq\.uk$/.test(location.hostname)) c += "; Domain=dbhq.uk";
    document.cookie = c;
    try { localStorage.removeItem("dbhq-consent"); } catch (e) {}
  }

  // Bots that run JavaScript, and scrapers rotating desktop Chrome or
  // Firefox about two years stale. Mobile, Win7/8 and Firefox ESR are
  // exempt. Kept identical to ScentVerdict's svAnalytics.likelyBot.
  function likelyBot() {
    try {
      if (navigator.webdriver) return true;
      var ua = navigator.userAgent || "";
      if (/bot|crawl|spider|headless/i.test(ua)) return true;
      if (/Android|Mobile|CrOS/.test(ua) || !/Windows NT 10\.0|Macintosh|X11/.test(ua)) return false;
      var n = Math.max(0, Math.floor((Date.now() - Date.UTC(2025, 8, 2)) / 2592e6));
      var c = /Chrome\/(\d+)\./.exec(ua);
      if (c) return +c[1] < 140 + n - 24;
      var f = /Firefox\/(\d+)\./.exec(ua);
      if (f) return [115, 128, 140, 153].indexOf(+f[1]) < 0 && +f[1] < 142 + n - 24;
    } catch (e) {}
    return false;
  }

  // GA4 sets _ga on the highest domain it can (.dbhq.uk), so expire the
  // cookies on this host and on every parent domain.
  function deleteGaCookies() {
    var parts = location.hostname.split(".");
    document.cookie.split("; ").forEach(function (c) {
      var name = c.split("=")[0];
      if (name === "_ga" || name.indexOf("_ga_") === 0) {
        var expired = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        document.cookie = expired;
        for (var i = 0; i < parts.length - 1; i++) document.cookie = expired + "; domain=." + parts.slice(i).join(".");
      }
    });
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  var bot = likelyBot();
  var loaded = false;
  function load() {
    if (!prod || bot || loaded) return;
    loaded = true;
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    gtag("js", new Date());
    gtag("config", gaId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + gaId;
    document.head.appendChild(s);
  }

  window.dbhqAnalytics = {
    choice: readChoice,
    keepOn: function () {
      writeChoice("on");
      window["ga-disable-" + gaId] = false;
      if (loaded) gtag("consent", "update", { analytics_storage: "granted" });
      load();
    },
    // Denied consent alone still lets GA4 send cookieless pings, including
    // the user_engagement hit it flushes when the page is left. Google's
    // ga-disable flag stops every hit from this page; later pages do not
    // load GA4 at all.
    optOut: function () {
      writeChoice("off");
      window["ga-disable-" + gaId] = true;
      if (loaded) gtag("consent", "update", { analytics_storage: "denied" });
      deleteGaCookies();
    },
  };

  var choice = readChoice();
  if (choice && !/(?:^|; )dbhq_analytics=/.test(document.cookie)) writeChoice(choice);
  if (choice !== "off") load();
})();
