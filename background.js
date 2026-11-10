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
const VALID_FAVORITES_URLS = new Set(["edge://favorites/", "chrome://bookmarks/"]);
const VALID_MAP_PROVIDERS = new Set(["google", "bing", "apple"]);
const VALID_CLIPBOARD_OPEN_MODES = new Set(["new_tab", "current_tab"]);
const CLIPBOARD_HASH_REGEX = /^[a-zA-Z0-9:_-]{0,64}$/;
const RGBA_COLOR_REGEX = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([01](?:\.\d+)?)\)$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const COLLECTION_ID_REGEX = /^col_[a-zA-Z0-9_-]{4,36}$/;
const BOOKMARK_ID_REGEX = /^[a-zA-Z0-9_-]{1,48}$/;
const MAX_COLLECTIONS = 100;
const MAX_COLLECTION_ITEMS = 300;
const MAX_BAR_ORDER_ITEMS = 600;

function detectFavoritesUrl() {
  const brands = navigator.userAgentData?.brands;
  if (
    Array.isArray(brands) &&
    brands.some((b) => typeof b.brand === "string" && (b.brand.includes("Edge") || b.brand.includes("Edg")))
  ) {
    return "edge://favorites/";
  }
  if (typeof navigator !== "undefined" && typeof navigator.userAgent === "string" && navigator.userAgent.includes("Edg/")) {
    return "edge://favorites/";
  }
  return "chrome://bookmarks/";
}

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
  smartClipboard: false,
  clipboardMapProvider: "google", // "google" | "bing" | "apple"
  clipboardOpenMode: "new_tab", // "new_tab" | "current_tab"
  lastClipboardHash: "",
  favoritesUrl: detectFavoritesUrl(),
  collections: [],
  collectionsShowAddedOnBar: false,
  collectionsAllowDuplicateItems: false,
  barBookmarksOrder: [],
  themeCache: {} // Memoriza { theme, bgBar } por buscador
};

let cachedSettings = { ...DEFAULT_SETTINGS };
let isCacheReady = false;

function sanitizeCollectionItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") return null;
  if (!isSafeHttpUrl(rawItem.url)) return null;
  let normalizedUrl;
  try {
    normalizedUrl = new URL(rawItem.url).toString();
  } catch (e) {
    return null;
  }
  const id =
    typeof rawItem.id === "string" && BOOKMARK_ID_REGEX.test(rawItem.id)
      ? rawItem.id
      : `bm_${Math.random().toString(36).slice(2, 10)}`;
  const title =
    typeof rawItem.title === "string"
      ? rawItem.title.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200)
      : "";
  return { id, title, url: normalizedUrl };
}

function sanitizeCollectionsList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const safeList = [];
  const seenIds = new Set();

  for (let i = 0; i < rawList.length && safeList.length < MAX_COLLECTIONS; i++) {
    const col = rawList[i];
    if (!col || typeof col !== "object") continue;
    if (typeof col.id !== "string" || !COLLECTION_ID_REGEX.test(col.id)) continue;
    if (seenIds.has(col.id)) continue;
    seenIds.add(col.id);

    const name =
      typeof col.name === "string"
        ? col.name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 60)
        : "";
    const emoji =
      typeof col.emoji === "string"
        ? col.emoji.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 16)
        : "";
    const color =
      typeof col.color === "string" && HEX_COLOR_REGEX.test(col.color)
        ? col.color.toLowerCase()
        : "#3b9eff";
    const hidden = Boolean(col.hidden);

    const safeItems = [];
    const seenUrls = new Set();
    if (Array.isArray(col.items)) {
      for (let j = 0; j < col.items.length && safeItems.length < MAX_COLLECTION_ITEMS; j++) {
        const cleanItem = sanitizeCollectionItem(col.items[j]);
        if (cleanItem && !seenUrls.has(cleanItem.url)) {
          seenUrls.add(cleanItem.url);
          safeItems.push(cleanItem);
        }
      }
    }

    safeList.push({
      id: col.id,
      name,
      emoji,
      color,
      hidden,
      items: safeItems
    });
  }

  return safeList;
}

function sanitizeBarBookmarksOrder(rawOrder) {
  if (!Array.isArray(rawOrder)) return null;
  const safeOrder = [];
  const seen = new Set();
  for (let i = 0; i < rawOrder.length && safeOrder.length < MAX_BAR_ORDER_ITEMS; i++) {
    const id = rawOrder[i];
    if (typeof id === "string" && BOOKMARK_ID_REGEX.test(id) && !seen.has(id)) {
      seen.add(id);
      safeOrder.push(id);
    }
  }
  return safeOrder;
}

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
  if (typeof raw.smartClipboard === "boolean") {
    clean.smartClipboard = raw.smartClipboard;
  }
  if (typeof raw.clipboardMapProvider === "string" && VALID_MAP_PROVIDERS.has(raw.clipboardMapProvider)) {
    clean.clipboardMapProvider = raw.clipboardMapProvider;
  }
  if (typeof raw.clipboardOpenMode === "string" && VALID_CLIPBOARD_OPEN_MODES.has(raw.clipboardOpenMode)) {
    clean.clipboardOpenMode = raw.clipboardOpenMode;
  }
  if (typeof raw.lastClipboardHash === "string" && CLIPBOARD_HASH_REGEX.test(raw.lastClipboardHash)) {
    clean.lastClipboardHash = raw.lastClipboardHash;
  }
  if (Array.isArray(raw.collections)) {
    const safeCollections = sanitizeCollectionsList(raw.collections);
    if (safeCollections !== null) {
      clean.collections = safeCollections;
    }
  }
  if (typeof raw.collectionsShowAddedOnBar === "boolean") {
    clean.collectionsShowAddedOnBar = raw.collectionsShowAddedOnBar;
  }
  if (typeof raw.collectionsAllowDuplicateItems === "boolean") {
    clean.collectionsAllowDuplicateItems = raw.collectionsAllowDuplicateItems;
  }
  if (Array.isArray(raw.barBookmarksOrder)) {
    const safeOrder = sanitizeBarBookmarksOrder(raw.barBookmarksOrder);
    if (safeOrder !== null) {
      clean.barBookmarksOrder = safeOrder;
    }
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

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

let offscreenCreatingPromise = null;

async function ensureOffscreenDocument() {
  if (!cachedSettings.smartClipboard || !chrome.offscreen) return false;
  try {
    if (typeof chrome.offscreen.hasDocument === "function") {
      const exists = await chrome.offscreen.hasDocument();
      if (exists) return true;
    }
    if (!offscreenCreatingPromise) {
      offscreenCreatingPromise = chrome.offscreen
        .createDocument({
          url: "offscreen.html",
          reasons: [chrome.offscreen.Reason?.CLIPBOARD || "CLIPBOARD"],
          justification: "Analisar item copiado para sugestões inteligentes na barra quando ativado pelo usuário."
        })
        .catch(() => {})
        .finally(() => {
          offscreenCreatingPromise = null;
        });
    }
    await offscreenCreatingPromise;
    return true;
  } catch (e) {
    return false;
  }
}

async function closeOffscreenDocumentIfDisabled() {
  if (cachedSettings.smartClipboard || !chrome.offscreen) return;
  try {
    if (typeof chrome.offscreen.hasDocument === "function") {
      const exists = await chrome.offscreen.hasDocument();
      if (!exists) return;
    }
    await chrome.offscreen.closeDocument();
  } catch (e) {}
}

function syncSettingsCache(callback) {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    cachedSettings = {
      ...DEFAULT_SETTINGS,
      ...res,
      collections: sanitizeCollectionsList(res.collections) || [],
      barBookmarksOrder: sanitizeBarBookmarksOrder(res.barBookmarksOrder) || []
    };
    isCacheReady = true;
    setupPreWarmer();
    closeOffscreenDocumentIfDisabled();
    if (callback) callback(cachedSettings);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    const favoritesUrl = VALID_FAVORITES_URLS.has(res.favoritesUrl)
      ? res.favoritesUrl
      : detectFavoritesUrl();
    const merged = {
      ...DEFAULT_SETTINGS,
      ...res,
      favoritesUrl,
      collections: sanitizeCollectionsList(res.collections) || [],
      barBookmarksOrder: sanitizeBarBookmarksOrder(res.barBookmarksOrder) || []
    };
    chrome.storage.local.set(merged);
    cachedSettings = merged;
    isCacheReady = true;
    setupPreWarmer();
    closeOffscreenDocumentIfDisabled();
  });
});

syncSettingsCache();

chrome.storage.onChanged.addListener((changes) => {
  for (let key in changes) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      if (key === "collections") {
        cachedSettings.collections = sanitizeCollectionsList(changes[key].newValue) || [];
      } else if (key === "barBookmarksOrder") {
        cachedSettings.barBookmarksOrder = sanitizeBarBookmarksOrder(changes[key].newValue) || [];
      } else {
        cachedSettings[key] = changes[key].newValue;
      }
    }
  }
  if (changes.acceleration || changes.engine) {
    setupPreWarmer();
  }
  if (changes.smartClipboard) {
    closeOffscreenDocumentIfDisabled();
  }
  if (
    changes.smartClipboard ||
    changes.clipboardMapProvider ||
    changes.clipboardOpenMode ||
    changes.lastClipboardHash ||
    changes.collections ||
    changes.collectionsShowAddedOnBar ||
    changes.collectionsAllowDuplicateItems ||
    changes.barBookmarksOrder
  ) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (typeof tab.id === "number") {
          chrome.tabs.sendMessage(tab.id, { action: "settingsUpdated", settings: cachedSettings }).catch(() => {});
        }
      });
    });
  }
});

const redirectingTabIds = new Set();

chrome.tabs.onRemoved.addListener((tabId) => {
  redirectingTabIds.delete(tabId);
});

// Cria uma aba limpa com a URL de destino e fecha a aba New Tab original
// para evitar que o Chromium force o foco e selecione a URL na barra de endereços (omnibox)
function openCleanNewTab(tab, targetUrl) {
  if (!tab || typeof tab.id !== "number") return;
  if (redirectingTabIds.has(tab.id)) return;
  redirectingTabIds.add(tab.id);

  const createProps = {
    url: targetUrl,
    active: tab.active !== false
  };
  if (typeof tab.windowId === "number") {
    createProps.windowId = tab.windowId;
  }
  if (typeof tab.index === "number") {
    createProps.index = tab.index;
  }

  chrome.tabs.create(createProps, (createdTab) => {
    if (chrome.runtime.lastError || !createdTab) {
      chrome.tabs.update(tab.id, { url: targetUrl }, () => {
        void chrome.runtime.lastError;
        redirectingTabIds.delete(tab.id);
      });
      return;
    }
    chrome.tabs.remove(tab.id, () => {
      void chrome.runtime.lastError;
      redirectingTabIds.delete(tab.id);
    });
  });
}

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
    openCleanNewTab(tab, targetUrl);
  } else {
    syncSettingsCache((settings) => {
      if (!settings.acceleration || redirectingTabIds.has(tab.id)) return;
      const targetUrl = ENGINES[settings.engine] || ENGINES.google;
      chrome.tabs.get(tab.id, (currentTab) => {
        if (chrome.runtime.lastError || !currentTab) return;
        if (currentTab.pendingUrl === targetUrl || currentTab.url === targetUrl) return;
        openCleanNewTab(currentTab, targetUrl);
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

function fetchAllBookmarksFlat(callback) {
  chrome.bookmarks.getTree((tree) => {
    const results = [];
    const seenUrls = new Set();

    const addLeaf = (node) => {
      if (!node || !node.url || !isSafeHttpUrl(node.url)) return;
      let normalizedUrl;
      try {
        normalizedUrl = new URL(node.url).toString();
      } catch (e) {
        return;
      }
      if (seenUrls.has(normalizedUrl)) return;
      seenUrls.add(normalizedUrl);
      results.push({
        id: String(node.id || ""),
        title: String(node.title || "").trim() || normalizedUrl,
        url: normalizedUrl
      });
    };

    const walkFolder = (nodes) => {
      if (!Array.isArray(nodes)) return;
      // Primeiro links diretos do nível atual, depois subpastas
      for (const n of nodes) {
        if (n && n.url) addLeaf(n);
      }
      for (const n of nodes) {
        if (n && Array.isArray(n.children)) walkFolder(n.children);
      }
    };

    const rootChildren = tree?.[0]?.children;
    if (Array.isArray(rootChildren)) {
      walkFolder(rootChildren);
    }

    callback(results);
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
chrome.bookmarks.onMoved.addListener(() => {
  if (Array.isArray(cachedSettings.barBookmarksOrder) && cachedSettings.barBookmarksOrder.length > 0) {
    fetchBookmarksBar((items) => {
      const nativeIds = items.map((n) => String(n.id)).filter(Boolean);
      cachedSettings.barBookmarksOrder = nativeIds;
      chrome.storage.local.set({ barBookmarksOrder: nativeIds }, () => {
        notifyBookmarksChanged();
      });
    });
    return;
  }
  notifyBookmarksChanged();
});

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

  if (request.action === "getAllBookmarks") {
    fetchAllBookmarksFlat((bookmarks) => {
      sendResponse({ ok: true, bookmarks });
    });
    return true;
  }

  if (request.action === "redirectNewTab") {
    const tab = sender.tab;
    if (!tab || typeof tab.id !== "number") {
      sendResponse({ ok: false });
      return false;
    }
    const doRedirect = () => {
      const targetUrl = ENGINES[cachedSettings.engine] || ENGINES.google;
      openCleanNewTab(tab, targetUrl);
      sendResponse({ ok: true });
    };
    if (isCacheReady) doRedirect();
    else syncSettingsCache(doRedirect);
    return true;
  }

  if (request.action === "openFavoritesManager") {
    const url = VALID_FAVORITES_URLS.has(cachedSettings.favoritesUrl)
      ? cachedSettings.favoritesUrl
      : DEFAULT_SETTINGS.favoritesUrl;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === "updateSettings") {
    const sanitized = sanitizeSettingsPartial(request.newSettings);
    cachedSettings = { ...cachedSettings, ...sanitized };
    chrome.storage.local.set(sanitized, () => {
      closeOffscreenDocumentIfDisabled();
      sendResponse({ ok: true, settings: cachedSettings });
    });
    return true;
  }

  if (request.action === "readClipboard") {
    const handleRead = async () => {
      if (!cachedSettings.smartClipboard) {
        sendResponse({ ok: false, disabled: true });
        return;
      }
      const ready = await ensureOffscreenDocument();
      if (!ready) {
        sendResponse({ ok: false });
        return;
      }
      chrome.runtime.sendMessage(
        {
          target: "mnt-offscreen-clipboard",
          action: "readClipboardSlice",
          knownHash: cachedSettings.lastClipboardHash || ""
        },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            sendResponse({ ok: false });
            return;
          }
          const alreadyAnalyzed = Boolean(
            res.alreadyAnalyzed || (res.hash && res.hash === cachedSettings.lastClipboardHash)
          );
          sendResponse({
            ...res,
            alreadyAnalyzed
          });
        }
      );
    };
    if (isCacheReady) handleRead();
    else syncSettingsCache(handleRead);
    return true;
  }

  if (request.action === "markClipboardAnalyzed") {
    if (typeof request.hash === "string" && CLIPBOARD_HASH_REGEX.test(request.hash) && request.hash.length > 0) {
      cachedSettings.lastClipboardHash = request.hash;
      chrome.storage.local.set({ lastClipboardHash: request.hash }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }
    sendResponse({ ok: false });
    return false;
  }

  if (request.action === "openClipboardUrl") {
    if (!isSafeHttpUrl(request.url)) {
      sendResponse({ ok: false });
      return false;
    }
    const openMode = request.openMode === "current_tab" ? "current_tab" : "new_tab";
    if (openMode === "current_tab" && sender.tab && typeof sender.tab.id === "number") {
      chrome.tabs.update(sender.tab.id, { url: request.url }, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
    } else {
      chrome.tabs.create({ url: request.url, active: true }, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
    }
    return true;
  }

  return false;
});