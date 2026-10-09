// Hands a file (a photo) from the game to the browser as a download — Photo mode (ASTRA §11).
mergeInto(LibraryManager.library, {
  JapanMapDownload: function (namePtr, dataPtr, length, typePtr) {
    var name = UTF8ToString(namePtr);
    var type = UTF8ToString(typePtr);
    var bytes = HEAPU8.slice(dataPtr, dataPtr + length);
    var url = URL.createObjectURL(new Blob([bytes], { type: type }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
});
