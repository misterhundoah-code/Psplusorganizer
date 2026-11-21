// Moving house: the site lives at wallofpsplus.com now. Browsers keep saved data per address, so
// people who used the old GitHub address without an account would arrive at the new one with an
// empty list. This script, loaded first on every page, fixes that in two halves:
//
//  - On the old address it checks that the new site is up, packs this browser's saved data
//    (everything under "psplus-", except sign-in details) into the link's #fragment, which
//    browsers never send to any server, and forwards to the same page on the new address.
//  - On the new address it unpacks that data before the app reads anything, keeping whatever is
//    already saved there and adding what's missing, then tidies the address bar.
//
// Signed-in people just sign in again on the new address; their records come back from the server.
(function () {
  var NEW = "https://wallofpsplus.com";
  var OLD_HOST = "misterhundoah-code.github.io";
  var PREFIX = "psplus-";
  var SKIP = { "psplus-acct": 1 };

  var b64e = function (s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  var b64d = function (s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(atob(s)));
  };

  try {
    if (location.hostname === OLD_HOST) {
      var page = location.pathname.replace(/^\/Psplusorganizer\/?/i, "/").replace(/\/index\.html$/, "/");
      var html = document.documentElement;
      html.style.visibility = "hidden";
      var show = function () { html.style.visibility = ""; };
      var timer = setTimeout(show, 4000);
      // Only move once the new address answers, so a DNS or certificate hiccup can't strand anyone.
      fetch(NEW + "/move.js?ping=" + Date.now(), { mode: "no-cors", cache: "no-store" }).then(function () {
        var data = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0 && !SKIP[k]) data[k] = localStorage.getItem(k);
        }
        var carry = page === "/" && Object.keys(data).length ? "#move=" + b64e(JSON.stringify(data)) : location.hash;
        clearTimeout(timer);
        location.replace(NEW + page + location.search + carry);
      }, function () { clearTimeout(timer); show(); });
      return;
    }

    if (location.hash.indexOf("#move=") === 0) {
      var incoming = JSON.parse(b64d(location.hash.slice(6)));
      Object.keys(incoming).forEach(function (k) {
        if (k.indexOf(PREFIX) !== 0 || SKIP[k] || typeof incoming[k] !== "string") return;
        var here = localStorage.getItem(k);
        if (here === null) { localStorage.setItem(k, incoming[k]); return; }
        // Both have something: for records kept as objects (marks, ratings, notes...), add the
        // entries this browser doesn't have yet and keep the ones it does.
        try {
          var a = JSON.parse(incoming[k]), b = JSON.parse(here);
          if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
            for (var key in b) a[key] = b[key];
            localStorage.setItem(k, JSON.stringify(a));
          }
        } catch (e) {}
      });
      try { sessionStorage.setItem("psplus-moved", "1"); } catch (e) {}
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
})();
