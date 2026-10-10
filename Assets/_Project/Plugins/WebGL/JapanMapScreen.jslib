// Screen facts the Unity web player does not expose: CSS pixel ratio and the safe-area insets
// (notch, home bar) — UiPanel lays the UI out in CSS pixels inside them (ASTRA §10).
mergeInto(LibraryManager.library, {
  JapanMapDevicePixelRatio: function () {
    return window.devicePixelRatio || 1;
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
