// Fetch a file next to the game and hand its bytes to C# (StreamedTerrain, D36). gzip is undone by the browser's own
// DecompressionStream (Chrome 80, Safari 16.4, Firefox 113); a host that already decoded it, or an old browser that
// fetches the plain file, works too. The callback gets (id, pointer, length); length -1 = failed. C# frees the pointer.
mergeInto(LibraryManager.library, {
  JM_FetchBytes: function (urlPtr, plainPtr, id, cb) {
    var url = UTF8ToString(urlPtr);
    var plain = UTF8ToString(plainPtr);
    var give = function (bytes) {
      var ptr = _malloc(bytes.length);
      HEAPU8.set(bytes, ptr);
      {{{ makeDynCall('viii', 'cb') }}}(id, ptr, bytes.length);
    };
    var fail = function (e) {
      console.warn('[Content] ' + url + ': ' + e);
      {{{ makeDynCall('viii', 'cb') }}}(id, 0, -1);
    };
    var get = function (u) {
      return fetch(u).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      });
    };
    if (typeof DecompressionStream === 'undefined') { get(plain).then(function (b) { give(new Uint8Array(b)); }).catch(fail); return; }
    get(url).then(function (b) {
      var bytes = new Uint8Array(b);
      if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // already decoded on the way
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer().then(function (u) { return new Uint8Array(u); });
    }).then(give).catch(fail);
  },
});
