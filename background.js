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
const VALID_DICT_PROVIDERS = new Set(["dicio", "sinonimos", "linguee"]);
const VALID_CLIPBOARD_OPEN_MODES = new Set(["new_tab", "current_tab"]);
const CLIPBOARD_HASH_REGEX = /^[a-zA-Z0-9:_-]{0,64}$/;
const DEFAULT_CLIPBOARD_CATEGORIES = {
  colar: true,
  site: true,
  code: true,
  maps: true,
  dict: true
};
const RGBA_COLOR_REGEX = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([01](?:\.\d+)?)\)$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const COLLECTION_ID_REGEX = /^col_[a-zA-Z0-9_-]{4,36}$/;
const CUSTOM_SITE_ID_REGEX = /^custom_[a-zA-Z0-9_-]{4,36}$/;
const HOSTNAME_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/i;
const BOOKMARK_ID_REGEX = /^[a-zA-Z0-9_-]{1,48}$/;
const MAX_COLLECTIONS = 100;
const MAX_COLLECTION_ITEMS = 300;
const MAX_BAR_ORDER_ITEMS = 600;
const MAX_CUSTOM_SITES = 50;
const DYNAMIC_CUSTOM_SCRIPT_ID = "mnt-custom-home-cs";

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
  lastPredefinedEngine: "google",
  customSites: [],
  barVisibility: "home_only", // "home_only" | "always" | "never"
  acceleration: true,
  smartClipboard: true,
  smartClipboardDefaultV2Applied: false,
  clipboardMapProvider: "google", // "google" | "bing" | "apple"
  clipboardDictProvider: "dicio", // "dicio" | "sinonimos" | "linguee"
  clipboardOpenMode: "new_tab", // "new_tab" | "current_tab"
  clipboardAllCategories: true,
  clipboardCategories: { ...DEFAULT_CLIPBOARD_CATEGORIES },
  clipboardShortcut: true,
  lastClipboardHash: "",
  favoritesUrl: detectFavoritesUrl(),
  collections: [],
  collectionsShowAddedOnBar: false,
  collectionsAllowDuplicateItems: false,
  barBookmarksOrder: [],
  themeCache: {} // Memoriza { theme, bgBar } por buscador ou home personalizada
};

let cachedSettings = { ...DEFAULT_SETTINGS };
let isCacheReady = false;

function isPredefinedEngine(engineId) {
  return typeof engineId === "string" && Object.prototype.hasOwnProperty.call(ENGINES, engineId);
}

function isSafeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port;
  } catch (e) {
    return false;
  }
}

function stripWwwHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function normalizeCustomSiteInput(rawInput) {
  if (typeof rawInput !== "string") return null;
  const cleaned = rawInput.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 2000 || /\s/.test(cleaned)) return null;

  let withProtocol = cleaned;
  if (/^http:\/\//i.test(withProtocol)) {
    withProtocol = withProtocol.replace(/^http:\/\//i, "https://");
  } else if (!/^https:\/\//i.test(withProtocol)) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withProtocol)) return null;
    withProtocol = `https://${withProtocol}`;
  }

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (e) {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return null;
  }

  const rawHost = parsed.hostname.toLowerCase();
  const bareHost = stripWwwHost(rawHost);
  if (!bareHost || !HOSTNAME_REGEX.test(bareHost)) return null;

  const pathPart =
    parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "";
  const label = (bareHost + pathPart).slice(0, 48);

  return {
    url: parsed.toString(),
    host: bareHost,
    label
  };
}

function sanitizeCustomSitesList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const safeList = [];
  const seenIds = new Set();
  const seenUrls = new Set();

  for (let i = 0; i < rawList.length && safeList.length < MAX_CUSTOM_SITES; i++) {
    const item = rawList[i];
    if (!item || typeof item !== "object") continue;
    if (typeof item.id !== "string" || !CUSTOM_SITE_ID_REGEX.test(item.id)) continue;
    if (seenIds.has(item.id)) continue;

    const normalized = normalizeCustomSiteInput(item.url);
    if (!normalized) continue;
    if (seenUrls.has(normalized.url)) continue;

    seenIds.add(item.id);
    seenUrls.add(normalized.url);

    const customLabel =
      typeof item.label === "string"
        ? item.label.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 48)
        : "";
    const resolvedCandidate =
      typeof item.resolvedHost === "string" ? stripWwwHost(item.resolvedHost) : "";
    const resolvedHost =
      resolvedCandidate && HOSTNAME_REGEX.test(resolvedCandidate) && resolvedCandidate !== normalized.host
        ? resolvedCandidate
        : "";

    safeList.push({
      id: item.id,
      url: normalized.url,
      host: normalized.host,
      label: customLabel || normalized.label,
      resolvedHost
    });
  }

  return safeList;
}

function findCustomSiteById(customSites, siteId) {
  if (!Array.isArray(customSites) || typeof siteId !== "string" || !CUSTOM_SITE_ID_REGEX.test(siteId)) {
    return null;
  }
  return customSites.find((s) => s && s.id === siteId) || null;
}

function ensureValidEngineState(settings) {
  if (!settings || typeof settings !== "object") return settings;
  if (!isPredefinedEngine(settings.lastPredefinedEngine)) {
    settings.lastPredefinedEngine = "google";
  }
  if (!Array.isArray(settings.customSites)) {
    settings.customSites = [];
  }
  if (isPredefinedEngine(settings.engine)) {
    settings.lastPredefinedEngine = settings.engine;
  } else if (!findCustomSiteById(settings.customSites, settings.engine)) {
    settings.engine = settings.lastPredefinedEngine;
  }
  return settings;
}

function getActiveTargetUrl(settings) {
  if (settings && isPredefinedEngine(settings.engine)) {
    return ENGINES[settings.engine];
  }
  const custom = settings ? findCustomSiteById(settings.customSites, settings.engine) : null;
  if (custom && isSafeHttpsUrl(custom.url)) {
    return custom.url;
  }
  const fallbackKey =
    settings && isPredefinedEngine(settings.lastPredefinedEngine)
      ? settings.lastPredefinedEngine
      : "google";
  return ENGINES[fallbackKey] || ENGINES.google;
}

function isEffectiveAccelerationEnabled(settings) {
  return Boolean(settings && settings.acceleration && isPredefinedEngine(settings.engine));
}

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

function sanitizeClipboardCategories(rawCats) {
  if (!rawCats || typeof rawCats !== "object" || Array.isArray(rawCats)) return null;
  const clean = { ...DEFAULT_CLIPBOARD_CATEGORIES };
  for (const key of Object.keys(DEFAULT_CLIPBOARD_CATEGORIES)) {
    if (typeof rawCats[key] === "boolean") {
      clean[key] = rawCats[key];
    }
  }
  return clean;
}

// Valida e filtra apenas configurações permitidas antes de salvar no storage
function sanitizeSettingsPartial(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object") return clean;

  if (Array.isArray(raw.customSites)) {
    const safeCustomSites = sanitizeCustomSitesList(raw.customSites);
    if (safeCustomSites !== null) {
      clean.customSites = safeCustomSites;
    }
  }

  if (typeof raw.lastPredefinedEngine === "string" && isPredefinedEngine(raw.lastPredefinedEngine)) {
    clean.lastPredefinedEngine = raw.lastPredefinedEngine;
  }

  const effectiveCustomSites = clean.customSites || cachedSettings.customSites || [];
  if (typeof raw.engine === "string") {
    if (isPredefinedEngine(raw.engine)) {
      clean.engine = raw.engine;
      clean.lastPredefinedEngine = raw.engine;
    } else if (findCustomSiteById(effectiveCustomSites, raw.engine)) {
      clean.engine = raw.engine;
    }
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
  if (typeof raw.clipboardDictProvider === "string" && VALID_DICT_PROVIDERS.has(raw.clipboardDictProvider)) {
    clean.clipboardDictProvider = raw.clipboardDictProvider;
  }
  if (typeof raw.clipboardOpenMode === "string" && VALID_CLIPBOARD_OPEN_MODES.has(raw.clipboardOpenMode)) {
    clean.clipboardOpenMode = raw.clipboardOpenMode;
  }
  if (typeof raw.clipboardAllCategories === "boolean") {
    clean.clipboardAllCategories = raw.clipboardAllCategories;
  }
  if (raw.clipboardCategories && typeof raw.clipboardCategories === "object") {
    const safeCats = sanitizeClipboardCategories(raw.clipboardCategories);
    if (safeCats !== null) {
      clean.clipboardCategories = safeCats;
    }
  }
  if (typeof raw.clipboardShortcut === "boolean") {
    clean.clipboardShortcut = raw.clipboardShortcut;
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
    let customCount = 0;
    for (const key of Object.keys(raw.themeCache)) {
      const isEngineKey = isPredefinedEngine(key);
      const isCustomKey = !isEngineKey && CUSTOM_SITE_ID_REGEX.test(key);
      if (!isEngineKey && (!isCustomKey || customCount >= MAX_CUSTOM_SITES)) continue;
      const entry = raw.themeCache[key];
      if (
        entry &&
        typeof entry === "object" &&
        (entry.theme === "dark" || entry.theme === "light") &&
        isValidRgbaColor(entry.bgBar)
      ) {
        safeCache[key] = { theme: entry.theme, bgBar: entry.bgBar };
        if (isCustomKey) customCount++;
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

function isLikelyAuthRedirect(originalHost, finalUrlObj) {
  if (!finalUrlObj) return true;
  const finalHost = stripWwwHost(finalUrlObj.hostname);
  if (!finalHost || finalHost === originalHost || finalHost.endsWith(`.${originalHost}`)) {
    return false;
  }
  const ssoProviders = [
    "accounts.google.com",
    "login.microsoftonline.com",
    "login.live.com",
    "appleid.apple.com",
    "id.atlassian.com",
    "auth0.com",
    "okta.com",
    "onelogin.com"
  ];
  if (ssoProviders.some((p) => finalHost === p || finalHost.endsWith(`.${p}`))) {
    return true;
  }
  const pathAndQuery = `${finalUrlObj.pathname || ""}${finalUrlObj.search || ""}`;
  if (/\/(login|signin|sign-in|oauth|oauth2|authorize|sso|saml)\b/i.test(pathAndQuery)) {
    return true;
  }
  return false;
}

async function resolveRedirectHost(targetUrl, originalHost) {
  if (typeof fetch !== "function" || !isSafeHttpsUrl(targetUrl)) return "";
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 1200) : null;
  try {
    const resp = await fetch(targetUrl, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      credentials: "omit",
      signal: controller ? controller.signal : undefined
    });
    if (!resp || typeof resp.url !== "string") return "";
    const parsed = new URL(resp.url);
    if (parsed.protocol !== "https:") return "";
    const finalHost = stripWwwHost(parsed.hostname);
    if (
      !finalHost ||
      !HOSTNAME_REGEX.test(finalHost) ||
      finalHost === originalHost ||
      finalHost.endsWith(`.${originalHost}`)
    ) {
      return "";
    }
    if (isLikelyAuthRedirect(originalHost, parsed)) return "";
    return finalHost;
  } catch (e) {
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let dynamicScriptSyncChain = Promise.resolve();

function syncDynamicCustomContentScripts() {
  dynamicScriptSyncChain = dynamicScriptSyncChain
    .catch(() => {})
    .then(async () => {
      if (
        !chrome.scripting ||
        typeof chrome.scripting.registerContentScripts !== "function" ||
        typeof chrome.scripting.unregisterContentScripts !== "function"
      ) {
        return;
      }

      try {
        await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CUSTOM_SCRIPT_ID] });
      } catch (e) {}

      if (isPredefinedEngine(cachedSettings.engine)) {
        return;
      }

      const activeCustom = findCustomSiteById(cachedSettings.customSites, cachedSettings.engine);
      if (!activeCustom) return;

      const matchesSet = new Set();
      const addHostPatterns = (hostValue) => {
        if (typeof hostValue !== "string") return;
        const cleanHost = stripWwwHost(hostValue);
        if (!cleanHost || !HOSTNAME_REGEX.test(cleanHost)) return;
        matchesSet.add(`https://${cleanHost}/*`);
        matchesSet.add(`https://*.${cleanHost}/*`);
      };

      addHostPatterns(activeCustom.host);
      if (activeCustom.resolvedHost) {
        addHostPatterns(activeCustom.resolvedHost);
      }

      const matches = Array.from(matchesSet);
      if (matches.length === 0) return;

      try {
        await chrome.scripting.registerContentScripts([
          {
            id: DYNAMIC_CUSTOM_SCRIPT_ID,
            matches,
            js: ["smart-clipboard.js", "collections.js", "content.js"],
            runAt: "document_start",
            allFrames: false,
            persistAcrossSessions: true
          }
        ]);
      } catch (e) {}
    });

  return dynamicScriptSyncChain;
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
    const needsDefaultV2Migration = !res.smartClipboardDefaultV2Applied;
    const effectiveSmartClipboard = needsDefaultV2Migration ? true : Boolean(res.smartClipboard);

    cachedSettings = ensureValidEngineState({
      ...DEFAULT_SETTINGS,
      ...res,
      customSites: sanitizeCustomSitesList(res.customSites) || [],
      smartClipboard: effectiveSmartClipboard,
      smartClipboardDefaultV2Applied: true,
      clipboardCategories: sanitizeClipboardCategories(res.clipboardCategories) || { ...DEFAULT_CLIPBOARD_CATEGORIES },
      collections: sanitizeCollectionsList(res.collections) || [],
      barBookmarksOrder: sanitizeBarBookmarksOrder(res.barBookmarksOrder) || []
    });

    if (needsDefaultV2Migration) {
      chrome.storage.local.set({
        smartClipboard: true,
        smartClipboardDefaultV2Applied: true
      });
    }

    isCacheReady = true;
    setupPreWarmer();
    syncDynamicCustomContentScripts();
    closeOffscreenDocumentIfDisabled();
    if (callback) callback(cachedSettings);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
    const favoritesUrl = VALID_FAVORITES_URLS.has(res.favoritesUrl)
      ? res.favoritesUrl
      : detectFavoritesUrl();
    const needsDefaultV2Migration = !res.smartClipboardDefaultV2Applied;
    const merged = ensureValidEngineState({
      ...DEFAULT_SETTINGS,
      ...res,
      customSites: sanitizeCustomSitesList(res.customSites) || [],
      smartClipboard: needsDefaultV2Migration ? true : Boolean(res.smartClipboard),
      smartClipboardDefaultV2Applied: true,
      favoritesUrl,
      clipboardCategories: sanitizeClipboardCategories(res.clipboardCategories) || { ...DEFAULT_CLIPBOARD_CATEGORIES },
      collections: sanitizeCollectionsList(res.collections) || [],
      barBookmarksOrder: sanitizeBarBookmarksOrder(res.barBookmarksOrder) || []
    });
    chrome.storage.local.set(merged);
    cachedSettings = merged;
    isCacheReady = true;
    setupPreWarmer();
    syncDynamicCustomContentScripts();
    closeOffscreenDocumentIfDisabled();
  });
});

syncSettingsCache();

chrome.storage.onChanged.addListener((changes) => {
  for (let key in changes) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      if (key === "collections") {
        cachedSettings.collections = sanitizeCollectionsList(changes[key].newValue) || [];
      } else if (key === "customSites") {
        cachedSettings.customSites = sanitizeCustomSitesList(changes[key].newValue) || [];
      } else if (key === "barBookmarksOrder") {
        cachedSettings.barBookmarksOrder = sanitizeBarBookmarksOrder(changes[key].newValue) || [];
      } else if (key === "clipboardCategories") {
        cachedSettings.clipboardCategories =
          sanitizeClipboardCategories(changes[key].newValue) || { ...DEFAULT_CLIPBOARD_CATEGORIES };
      } else {
        cachedSettings[key] = changes[key].newValue;
      }
    }
  }
  ensureValidEngineState(cachedSettings);

  if (changes.acceleration || changes.engine || changes.customSites) {
    setupPreWarmer();
  }
  if (changes.engine || changes.customSites) {
    syncDynamicCustomContentScripts();
  }
  if (changes.smartClipboard) {
    closeOffscreenDocumentIfDisabled();
  }
  if (
    changes.engine ||
    changes.customSites ||
    changes.lastPredefinedEngine ||
    changes.barVisibility ||
    changes.acceleration ||
    changes.smartClipboard ||
    changes.clipboardMapProvider ||
    changes.clipboardDictProvider ||
    changes.clipboardOpenMode ||
    changes.clipboardAllCategories ||
    changes.clipboardCategories ||
    changes.clipboardShortcut ||
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
const pendingCustomHomeTabs = new Map();

function trackPendingCustomHomeTab(tabId, siteId) {
  if (typeof tabId !== "number" || typeof siteId !== "string") return;
  pendingCustomHomeTabs.set(tabId, {
    siteId,
    expiresAt: Date.now() + 20000
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  redirectingTabIds.delete(tabId);
  pendingCustomHomeTabs.delete(tabId);
});

if (chrome.tabs && chrome.tabs.onUpdated && typeof chrome.tabs.onUpdated.addListener === "function") {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const tracked = pendingCustomHomeTabs.get(tabId);
    if (!tracked) return;
    if (Date.now() > tracked.expiresAt) {
      pendingCustomHomeTabs.delete(tabId);
      return;
    }

    const currentUrl = changeInfo.url || tab?.url || "";
    if (!currentUrl || !currentUrl.startsWith("https://")) return;

    const site = findCustomSiteById(cachedSettings.customSites, tracked.siteId);
    if (!site || cachedSettings.engine !== site.id) {
      pendingCustomHomeTabs.delete(tabId);
      return;
    }

    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch (e) {
      return;
    }

    const finalHost = stripWwwHost(parsed.hostname);
    if (!finalHost || !HOSTNAME_REGEX.test(finalHost)) return;
    if (isLikelyAuthRedirect(site.host, parsed)) return;

    const matchesKnown =
      finalHost === site.host ||
      finalHost.endsWith(`.${site.host}`) ||
      (site.resolvedHost && (finalHost === site.resolvedHost || finalHost.endsWith(`.${site.resolvedHost}`)));

    if (!matchesKnown) {
      site.resolvedHost = finalHost;
      chrome.storage.local.set({ customSites: cachedSettings.customSites });
      syncDynamicCustomContentScripts();
    }

    if (changeInfo.status === "complete") {
      pendingCustomHomeTabs.delete(tabId);
      if (chrome.scripting && typeof chrome.scripting.executeScript === "function") {
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["smart-clipboard.js", "collections.js", "content.js"]
          })
          .catch(() => {});
      }
    }
  });
}

// Cria uma aba limpa com a URL de destino e fecha a aba New Tab original
// para evitar que o Chromium force o foco e selecione a URL na barra de endereços (omnibox)
function openCleanNewTab(tab, targetUrl, customSiteId = null) {
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
      if (customSiteId) trackPendingCustomHomeTab(tab.id, customSiteId);
      chrome.tabs.update(tab.id, { url: targetUrl }, () => {
        void chrome.runtime.lastError;
        redirectingTabIds.delete(tab.id);
      });
      return;
    }
    if (customSiteId && typeof createdTab.id === "number") {
      trackPendingCustomHomeTab(createdTab.id, customSiteId);
    }
    chrome.tabs.remove(tab.id, () => {
      void chrome.runtime.lastError;
      redirectingTabIds.delete(tab.id);
    });
  });
}

// CAMADA 1 DE ACELERAÇÃO: Intercepta a Nova Guia instantaneamente apenas nos buscadores pré-definidos
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
    if (!isEffectiveAccelerationEnabled(cachedSettings)) return;
    const targetUrl = getActiveTargetUrl(cachedSettings);
    openCleanNewTab(tab, targetUrl);
  } else {
    syncSettingsCache((settings) => {
      if (!isEffectiveAccelerationEnabled(settings) || redirectingTabIds.has(tab.id)) return;
      const targetUrl = getActiveTargetUrl(settings);
      chrome.tabs.get(tab.id, (currentTab) => {
        if (chrome.runtime.lastError || !currentTab) return;
        if (currentTab.pendingUrl === targetUrl || currentTab.url === targetUrl) return;
        openCleanNewTab(currentTab, targetUrl);
      });
    });
  }
});

// CAMADA 2 DE ACELERAÇÃO: Pre-warming de socket HTTP/3, TLS e DNS (somente buscadores pré-definidos)
function warmUpEngine() {
  if (!isEffectiveAccelerationEnabled(cachedSettings)) return;
  const targetUrl = getActiveTargetUrl(cachedSettings);
  fetch(targetUrl, {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    credentials: "omit"
  }).catch(() => {});
}

function setupPreWarmer() {
  if (!isEffectiveAccelerationEnabled(cachedSettings)) {
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
      const targetUrl = getActiveTargetUrl(cachedSettings);
      const activeCustom = !isPredefinedEngine(cachedSettings.engine)
        ? findCustomSiteById(cachedSettings.customSites, cachedSettings.engine)
        : null;
      openCleanNewTab(tab, targetUrl, activeCustom ? activeCustom.id : null);
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
    const applyUpdate = () => {
      const sanitized = sanitizeSettingsPartial(request.newSettings);
      cachedSettings = ensureValidEngineState({ ...cachedSettings, ...sanitized });
      chrome.storage.local.set(sanitized, () => {
        if (
          sanitized.engine !== undefined ||
          sanitized.customSites !== undefined ||
          sanitized.acceleration !== undefined
        ) {
          setupPreWarmer();
        }
        if (sanitized.engine !== undefined || sanitized.customSites !== undefined) {
          syncDynamicCustomContentScripts();
        }
        closeOffscreenDocumentIfDisabled();
        sendResponse({ ok: true, settings: cachedSettings });
      });
    };
    if (isCacheReady) applyUpdate();
    else syncSettingsCache(applyUpdate);
    return true;
  }

  if (request.action === "addAndSelectCustomSite") {
    const handleAddCustom = async () => {
      const normalized = normalizeCustomSiteInput(request.rawUrl);
      if (!normalized) {
        sendResponse({ ok: false, error: "invalid_url" });
        return;
      }

      const currentList = Array.isArray(cachedSettings.customSites) ? [...cachedSettings.customSites] : [];
      let site = currentList.find((s) => s && s.url === normalized.url) || null;

      if (!site) {
        if (currentList.length >= MAX_CUSTOM_SITES) {
          sendResponse({ ok: false, error: "limit_reached" });
          return;
        }
        site = {
          id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          url: normalized.url,
          host: normalized.host,
          label: normalized.label,
          resolvedHost: ""
        };
        currentList.push(site);
      }

      if (!site.resolvedHost) {
        const redirectedHost = await resolveRedirectHost(site.url, site.host);
        if (redirectedHost && redirectedHost !== site.host) {
          site.resolvedHost = redirectedHost;
        }
      }

      if (isPredefinedEngine(cachedSettings.engine)) {
        cachedSettings.lastPredefinedEngine = cachedSettings.engine;
      }
      cachedSettings.customSites = currentList;
      cachedSettings.engine = site.id;

      const toPersist = {
        customSites: cachedSettings.customSites,
        engine: cachedSettings.engine,
        lastPredefinedEngine: cachedSettings.lastPredefinedEngine
      };

      await new Promise((resolve) => chrome.storage.local.set(toPersist, resolve));
      setupPreWarmer();
      await syncDynamicCustomContentScripts();

      if (sender.tab && typeof sender.tab.id === "number") {
        trackPendingCustomHomeTab(sender.tab.id, site.id);
      }

      sendResponse({
        ok: true,
        site,
        targetUrl: site.url,
        settings: cachedSettings
      });
    };
    if (isCacheReady) handleAddCustom();
    else syncSettingsCache(handleAddCustom);
    return true;
  }

  if (request.action === "selectHomeEngine") {
    const handleSelectHome = async () => {
      const targetId = typeof request.engineId === "string" ? request.engineId : "";
      let targetUrl = null;
      let selectedCustomId = null;

      if (isPredefinedEngine(targetId)) {
        cachedSettings.engine = targetId;
        cachedSettings.lastPredefinedEngine = targetId;
        targetUrl = ENGINES[targetId];
      } else {
        const customSite = findCustomSiteById(cachedSettings.customSites, targetId);
        if (!customSite) {
          sendResponse({ ok: false, error: "not_found" });
          return;
        }
        if (isPredefinedEngine(cachedSettings.engine)) {
          cachedSettings.lastPredefinedEngine = cachedSettings.engine;
        }
        if (!customSite.resolvedHost) {
          const redirectedHost = await resolveRedirectHost(customSite.url, customSite.host);
          if (redirectedHost && redirectedHost !== customSite.host) {
            customSite.resolvedHost = redirectedHost;
          }
        }
        cachedSettings.engine = customSite.id;
        targetUrl = customSite.url;
        selectedCustomId = customSite.id;
      }

      const toPersist = {
        engine: cachedSettings.engine,
        lastPredefinedEngine: cachedSettings.lastPredefinedEngine,
        customSites: cachedSettings.customSites
      };

      await new Promise((resolve) => chrome.storage.local.set(toPersist, resolve));
      setupPreWarmer();
      await syncDynamicCustomContentScripts();

      if (selectedCustomId && sender.tab && typeof sender.tab.id === "number") {
        trackPendingCustomHomeTab(sender.tab.id, selectedCustomId);
      }

      sendResponse({
        ok: true,
        targetUrl,
        settings: cachedSettings
      });
    };
    if (isCacheReady) handleSelectHome();
    else syncSettingsCache(handleSelectHome);
    return true;
  }

  if (request.action === "removeCustomSite") {
    const handleRemoveCustom = async () => {
      const siteId = typeof request.siteId === "string" ? request.siteId : "";
      if (!CUSTOM_SITE_ID_REGEX.test(siteId)) {
        sendResponse({ ok: false });
        return;
      }

      const nextList = (Array.isArray(cachedSettings.customSites) ? cachedSettings.customSites : []).filter(
        (s) => s && s.id !== siteId
      );
      const wasActive = cachedSettings.engine === siteId;
      let fallbackUrl = null;

      cachedSettings.customSites = nextList;
      if (cachedSettings.themeCache && cachedSettings.themeCache[siteId]) {
        const nextThemeCache = { ...cachedSettings.themeCache };
        delete nextThemeCache[siteId];
        cachedSettings.themeCache = nextThemeCache;
      }

      if (wasActive) {
        const fallbackEngine = isPredefinedEngine(cachedSettings.lastPredefinedEngine)
          ? cachedSettings.lastPredefinedEngine
          : "google";
        cachedSettings.engine = fallbackEngine;
        fallbackUrl = ENGINES[fallbackEngine];
      }

      const toPersist = {
        customSites: cachedSettings.customSites,
        engine: cachedSettings.engine,
        themeCache: cachedSettings.themeCache || {}
      };

      await new Promise((resolve) => chrome.storage.local.set(toPersist, resolve));
      setupPreWarmer();
      await syncDynamicCustomContentScripts();

      sendResponse({
        ok: true,
        wasActive,
        fallbackEngine: cachedSettings.engine,
        fallbackUrl,
        settings: cachedSettings
      });
    };
    if (isCacheReady) handleRemoveCustom();
    else syncSettingsCache(handleRemoveCustom);
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

  if (request.action === "readClipboardFull") {
    const handleReadFull = async () => {
      if (!cachedSettings.smartClipboard) {
        sendResponse({ ok: false, disabled: true });
        return;
      }
      const ready = await ensureOffscreenDocument();
      if (!ready) {
        sendResponse({ ok: false });
        return;
      }
      const expectedHash =
        typeof request.expectedHash === "string" && CLIPBOARD_HASH_REGEX.test(request.expectedHash)
          ? request.expectedHash
          : "";
      chrome.runtime.sendMessage(
        {
          target: "mnt-offscreen-clipboard",
          action: "readClipboardFull",
          expectedHash
        },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok || typeof res.text !== "string") {
            sendResponse({ ok: false });
            return;
          }
          sendResponse({ ok: true, text: res.text });
        }
      );
    };
    if (isCacheReady) handleReadFull();
    else syncSettingsCache(handleReadFull);
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