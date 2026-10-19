const ENGINES = {
  google: "https://www.google.com/",
  duckduckgo: "https://duckduckgo.com/",
  yahoo: "https://br.search.yahoo.com/",
  brave: "https://search.brave.com/"
};

const DEFAULT_SETTINGS = {
  engine: "google",
  barVisibility: "home_only", // "home_only" | "always" | "never"
  acceleration: true
};

let cachedSettings = { ...DEFAULT_SETTINGS };

// Carrega e mantém as configurações em memória para resposta imediata (0ms)
function syncSettingsCache() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    cachedSettings = res;
    setupPreWarmer();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    chrome.storage.local.set(res);
    cachedSettings = res;
    setupPreWarmer();
  });
});

syncSettingsCache();

chrome.storage.onChanged.addListener((changes) => {
  for (let key in changes) {
    cachedSettings[key] = changes[key].newValue;
  }
  if (changes.acceleration || changes.engine) {
    setupPreWarmer();
  }
});

// CAMADA 1 DE ACELERAÇÃO: Intercepta a criação da Nova Guia antes da renderização
chrome.tabs.onCreated.addListener((tab) => {
  const pending = tab.pendingUrl || tab.url || "";
  if (
    cachedSettings.acceleration &&
    (pending.startsWith("edge://newtab") ||
      pending.startsWith("chrome://newtab") ||
      pending.includes("newtab.html"))
  ) {
    const targetUrl = ENGINES[cachedSettings.engine] || ENGINES.google;
    chrome.tabs.update(tab.id, { url: targetUrl });
  }
});

// CAMADA 2 DE ACELERAÇÃO: Pre-warming de socket HTTP/3, TLS e DNS
function warmUpEngine() {
  if (!cachedSettings.acceleration) return;
  const targetUrl = ENGINES[cachedSettings.engine] || ENGINES.google;
  fetch(targetUrl, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    credentials: "omit"
  }).catch(() => {});
}

function setupPreWarmer() {
  chrome.alarms.clear("engineWarmer", () => {
    if (cachedSettings.acceleration) {
      warmUpEngine();
      chrome.alarms.create("engineWarmer", { periodInMinutes: 0.75 }); // A cada 45s
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "engineWarmer") {
    warmUpEngine();
  }
});

// Busca a árvore da Barra de Favoritos
function fetchBookmarksBar(callback) {
  chrome.bookmarks.getTree((tree) => {
    const bookmarksBar = tree[0]?.children?.[0];
    callback(bookmarksBar ? bookmarksBar.children : []);
  });
}

// Atualiza as abas abertas automaticamente se o usuário editar os favoritos
function notifyBookmarksChanged() {
  fetchBookmarksBar((items) => {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: "bookmarksUpdated", items }).catch(() => {});
      });
    });
  });
}

chrome.bookmarks.onCreated.addListener(notifyBookmarksChanged);
chrome.bookmarks.onRemoved.addListener(notifyBookmarksChanged);
chrome.bookmarks.onChanged.addListener(notifyBookmarksChanged);
chrome.bookmarks.onMoved.addListener(notifyBookmarksChanged);

// Comunicação com o Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "initData") {
    fetchBookmarksBar((items) => {
      sendResponse({
        items,
        settings: cachedSettings,
        engines: ENGINES
      });
    });
    return true;
  }

  if (request.action === "openFavoritesManager") {
    chrome.tabs.create({ url: "edge://favorites/" });
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === "updateSettings") {
    chrome.storage.local.set(request.newSettings, () => {
      sendResponse({ ok: true, settings: cachedSettings });
    });
    return true;
  }
});