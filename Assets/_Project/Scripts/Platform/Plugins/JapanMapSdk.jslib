// Whether the browser refused the CrazyGames SDK script (ad blocker, offline). The page template notes it in a
// capturing error listener set before Unity loads; the SDK package itself never listens for that error.
mergeInto(LibraryManager.library, {
  JapanMapSdkScriptFailed: function () {
    return window.__jmSdkFailed ? 1 : 0;
  }
});
