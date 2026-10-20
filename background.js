const ENGINES = {
  google: "https://www.google.com/",
  duckduckgo: "https://duckduckgo.com/",
  yahoo: "https://br.search.yahoo.com/",
  brave: "https://search.brave.com/",
  gemini: "https://gemini.google.com/",
  claude: "https://claude.ai/",
  chatgpt: "https://chatgpt.com/",
  perplexity: "https://www.perplexity.ai/"
};

const VALID_VISIBILITY = new Set(["home_only", "always", "never"]);
const RGBA_COLOR_REGEX = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([01](?:\.\d+)?)\)$/;

function isValidRgbaColor(value) {
  if (typeof value !== "string") return false;
  const match = value.match(RGBA_COLOR_REGEX);
  if (!match) return false;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = Number(match[4]);
  return r <= 255 && g <= 255 && b <= 255 && a >= 0 && a <= 1;
}

const DEFAULT_SETTINGS = {
  engine: "google",
  barVisibility: "home_only", // "home_only" | "always" | "never"
  acceleration: true,
  themeCache: {} // Memoriza { theme, bgBar } por buscador
};

let cachedSettings = { ...DEFAULT_SETTINGS };
let isCacheReady = false;

// Valida e filtra apenas configurações permitidas antes de salvar no storage
function sanitizeSettingsPartial(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object") return clean;

  if (typeof raw.engine === "string" && Object.prototype.hasOwnProperty.call(ENGINES, raw.engine)) {
    clean.engine = raw.engine;
  }
  if (typeof raw.barVisibility === "string" && VALID_VISIBILITY.has(raw.barVisibility)) {
    clean.barVisibility = raw.barVisibility;
  }
  if (typeof raw.acceleration === "boolean") {
    clean.acceleration = raw.acceleration;
  }
  if (raw.themeCache && typeof raw.themeCache === "object" && !Array.isArray(raw.themeCache)) {
    const safeCache = {};
    for (const key of Object.keys(ENGINES)) {
      const entry = raw.themeCache[key];
      if (
        entry &&
        typeof entry === "object" &&
        (entry.theme === "dark" || entry.theme === "light") &&
        isValidRgbaColor(entry.bgBar)
      ) {
        safeCache[key] = { theme: entry.theme, bgBar: entry.bgBar };
      }
    }
    clean.themeCache = safeCache;
  }
  return clean;
}

function syncSettingsCache(callback) {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    cachedSettings = { ...DEFAULT_SETTINGS, ...res };
    isCacheReady = true;
    setupPreWarmer();
    if (callback) callback(cachedSettings);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    const merged = { ...DEFAULT_SETTINGS, ...res };
    chrome.storage.local.set(merged);
    cachedSettings = merged;
    isCacheReady = true;
    setupPreWarmer();
  });
});

syncSettingsCache();

chrome.storage.onChanged.addListener((changes) => {
  for (let key in changes) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      cachedSettings[key] = changes[key].newValue;
    }
  }
  if (changes.acceleration || changes.engine) {
    setupPreWarmer();
  }
});

// CAMADA 1 DE ACELERAÇÃO: Intercepta a Nova Guia instantaneamente (suporta protocolos do Edge e Chrome)
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab || typeof tab.id !== "number") return;
  const pending = tab.pendingUrl || tab.url || "";
  const extId = chrome.runtime.id;
  const isNewTab =
    pending.startsWith("edge://newtab") ||
    pending.startsWith("chrome://newtab") ||
    pending.startsWith(`chrome-extension://${extId}/newtab.html`) ||
    pending.startsWith(`extension://${extId}/newtab.html`);

  if (!isNewTab) return;

  if (isCacheReady) {
    if (!cachedSettings.acceleration) return;
    const targetUrl = ENGINES[cachedSettings.engine] || ENGINES.google;
    chrome.tabs.update(tab.id, { url: targetUrl }, () => {
      void chrome.runtime.lastError;
    });
  } else {
    syncSettingsCache((settings) => {
      if (!settings.acceleration) return;
      const targetUrl = ENGINES[settings.engine] || ENGINES.google;
      chrome.tabs.get(tab.id, (currentTab) => {
        if (chrome.runtime.lastError || !currentTab) return;
        if (currentTab.pendingUrl === targetUrl || currentTab.url === targetUrl) return;
        chrome.tabs.update(tab.id, { url: targetUrl }, () => {
          void chrome.runtime.lastError;
        });
      });
    });
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
  if (!cachedSettings.acceleration) {
    chrome.alarms.clear("engineWarmer");
    return;
  }
  warmUpEngine();
  chrome.alarms.get("engineWarmer", (existing) => {
    if (!existing) {
      chrome.alarms.create("engineWarmer", { periodInMinutes: 0.75 });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "engineWarmer" && isCacheReady) {
    warmUpEngine();
  }
});

function fetchBookmarksBar(callback) {
  chrome.bookmarks.getTree((tree) => {
    const bookmarksBar = tree[0]?.children?.[0];
    callback(bookmarksBar ? bookmarksBar.children : []);
  });
}

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Garante que apenas scripts da própria extensão possam se comunicar com o Service Worker
  if (sender.id !== chrome.runtime.id || !request || typeof request.action !== "string") {
    return false;
  }

  if (request.action === "initData") {
    const respond = () => {
      fetchBookmarksBar((items) => {
        sendResponse({
          items,
          settings: cachedSettings,
          engines: ENGINES
        });
      });
    };
    if (isCacheReady) respond();
    else syncSettingsCache(respond);
    return true;
  }

  if (request.action === "openFavoritesManager") {
    chrome.tabs.create({ url: "edge://favorites/" });
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === "updateSettings") {
    const sanitized = sanitizeSettingsPartial(request.newSettings);
    cachedSettings = { ...cachedSettings, ...sanitized };
    chrome.storage.local.set(sanitized, () => {
      sendResponse({ ok: true, settings: cachedSettings });
    });
    return true;
  }

  return false;
});