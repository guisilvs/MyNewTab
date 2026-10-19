chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getBookmarks") {
    chrome.bookmarks.getTree((tree) => {
      // No Chromium/Edge, o primeiro filho da raiz (id "1") é a "Barra de favoritos"
      const bookmarksBar = tree[0]?.children?.[0];
      sendResponse({
        items: bookmarksBar ? bookmarksBar.children : []
      });
    });
    return true; // Mantém o canal aberto para resposta assíncrona
  }
});