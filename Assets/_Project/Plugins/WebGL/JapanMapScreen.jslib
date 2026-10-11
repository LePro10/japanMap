// Screen facts the Unity web player does not expose: CSS pixel ratio and the safe-area insets
// (notch, home bar) — UiPanel lays the UI out in CSS pixels inside them (ASTRA §10).
mergeInto(LibraryManager.library, {
  // The ratio the canvas is really drawn at, not window.devicePixelRatio: the page caps it (index.html: 1 on iOS and
  // small phones, at most 2 elsewhere), and a UI scaled by the window's 2.6 or 3 on a canvas drawn at 2 or 1 came out
  // 1.3-3x too big on phones (human's Android, 2026-10-11: buttons and dial on top of each other).
  JapanMapDevicePixelRatio: function () {
    var c = Module.canvas;
    var w = c && c.getBoundingClientRect ? c.getBoundingClientRect().width : 0;
    if (w > 0 && c.width > 0) return c.width / w;
    return window.devicePixelRatio || 1;
  },
  // The game is really playable (first gameplayStart): the page's loading screen goes (index.html keeps it until then).
  JapanMapLoaded: function () {
    if (window.__jmLoaded) window.__jmLoaded();
  },
  JapanMapSafeInset: function (side) {
    if (!window.__jmSafe) {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(d);
      window.__jmSafe = d;
    }
    var cs = getComputedStyle(window.__jmSafe);
    var v = [cs.paddingLeft, cs.paddingTop, cs.paddingRight, cs.paddingBottom][side];
    return parseFloat(v) || 0;
  }
});
