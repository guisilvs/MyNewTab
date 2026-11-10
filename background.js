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
const MAX_DISMISSED_FOLDERS = 500;
const MAX_LOCKED_URLS = 2000;
const MAX_CUSTOM_SITES = 50;
const DYNAMIC_CUSTOM_SCRIPT_ID = "mnt-custom-home-cs";
const SYNC_COLLECTION_COLORS = [
  "#3b9eff",
  "#ff5a43",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#ef4444",
  "#84cc16"
];
const DEFAULT_FOLDER_SYNC_STATE = {
  dismissedFolderIds: [],
  userLockedUrls: [],
  promotedBarItems: [],
  archivedCollections: []
};

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
  collectionsSyncFolders: true,
  collectionsShowAddedOnBar: false,
  collectionsAllowDuplicateItems: false,
  folderSyncState: { ...DEFAULT_FOLDER_SYNC_STATE },
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

    const syncedFolderId =
      typeof col.syncedFolderId === "string" && BOOKMARK_ID_REGEX.test(col.syncedFolderId)
        ? col.syncedFolderId
        : "";

    const entry = {
      id: col.id,
      name,
      emoji,
      color,
      hidden,
      items: safeItems
    };

    if (syncedFolderId) {
      entry.syncedFolderId = syncedFolderId;
      entry.syncedFolderName =
        typeof col.syncedFolderName === "string"
          ? col.syncedFolderName.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 60)
          : name;
      entry.syncEnabled = col.syncEnabled !== false;
      entry.nameCustomized = Boolean(col.nameCustomized);
      entry.orderCustomized = Boolean(col.orderCustomized);

      const safeKnownUrls = [];
      const seenKnown = new Set();
      if (Array.isArray(col.knownFolderUrls)) {
        for (let k = 0; k < col.knownFolderUrls.length && safeKnownUrls.length < MAX_COLLECTION_ITEMS; k++) {
          const rawKnown = col.knownFolderUrls[k];
          if (!isSafeHttpUrl(rawKnown)) continue;
          let normKnown;
          try {
            normKnown = new URL(rawKnown).toString();
          } catch (e) {
            continue;
          }
          if (!seenKnown.has(normKnown)) {
            seenKnown.add(normKnown);
            safeKnownUrls.push(normKnown);
          }
        }
      }
      entry.knownFolderUrls = safeKnownUrls;
    }

    safeList.push(entry);
  }

  return safeList;
}

function sanitizeFolderSyncState(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return null;
  }

  const dismissedFolderIds = [];
  const seenDismissed = new Set();
  if (Array.isArray(rawState.dismissedFolderIds)) {
    for (let i = 0; i < rawState.dismissedFolderIds.length && dismissedFolderIds.length < MAX_DISMISSED_FOLDERS; i++) {
      const fid = rawState.dismissedFolderIds[i];
      if (typeof fid === "string" && BOOKMARK_ID_REGEX.test(fid) && !seenDismissed.has(fid)) {
        seenDismissed.add(fid);
        dismissedFolderIds.push(fid);
      }
    }
  }

  const userLockedUrls = [];
  const seenLocked = new Set();
  if (Array.isArray(rawState.userLockedUrls)) {
    for (let i = 0; i < rawState.userLockedUrls.length && userLockedUrls.length < MAX_LOCKED_URLS; i++) {
      const u = rawState.userLockedUrls[i];
      if (!isSafeHttpUrl(u)) continue;
      let norm;
      try {
        norm = new URL(u).toString();
      } catch (e) {
        continue;
      }
      if (!seenLocked.has(norm)) {
        seenLocked.add(norm);
        userLockedUrls.push(norm);
      }
    }
  }

  const promotedBarItems = [];
  const seenPromoted = new Set();
  if (Array.isArray(rawState.promotedBarItems)) {
    for (let i = 0; i < rawState.promotedBarItems.length && promotedBarItems.length < MAX_BAR_ORDER_ITEMS; i++) {
      const cleanItem = sanitizeCollectionItem(rawState.promotedBarItems[i]);
      if (cleanItem && !seenPromoted.has(cleanItem.url)) {
        seenPromoted.add(cleanItem.url);
        promotedBarItems.push(cleanItem);
      }
    }
  }

  const rawArchived = sanitizeCollectionsList(rawState.archivedCollections) || [];
  const archivedCollections = [];
  const seenArchivedFolders = new Set();
  for (let i = 0; i < rawArchived.length && archivedCollections.length < MAX_COLLECTIONS; i++) {
    const col = rawArchived[i];
    if (col && col.syncedFolderId && !seenArchivedFolders.has(col.syncedFolderId)) {
      seenArchivedFolders.add(col.syncedFolderId);
      archivedCollections.push(col);
    }
  }

  return {
    dismissedFolderIds,
    userLockedUrls,
    promotedBarItems,
    archivedCollections
  };
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
  if (typeof raw.collectionsSyncFolders === "boolean") {
    clean.collectionsSyncFolders = raw.collectionsSyncFolders;
  }
  if (typeof raw.collectionsShowAddedOnBar === "boolean") {
    clean.collectionsShowAddedOnBar = raw.collectionsShowAddedOnBar;
  }
  if (typeof raw.collectionsAllowDuplicateItems === "boolean") {
    clean.collectionsAllowDuplicateItems = raw.collectionsAllowDuplicateItems;
  }
  if (raw.folderSyncState && typeof raw.folderSyncState === "object") {
    const safeSyncState = sanitizeFolderSyncState(raw.folderSyncState);
    if (safeSyncState !== null) {
      clean.folderSyncState = safeSyncState;
    }
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
let bookmarkSyncChain = Promise.resolve();
let bookmarkEventDebounceTimer = null;
let pendingMovedBookmarkInfos = [];

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
      collectionsSyncFolders: res.collectionsSyncFolders !== false,
      folderSyncState: sanitizeFolderSyncState(res.folderSyncState) || {
        dismissedFolderIds: [],
        userLockedUrls: [],
        promotedBarItems: [],
        archivedCollections: []
      },
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
    reconcileBookmarksAndPersist({ broadcastTabs: false }, () => {
      if (callback) callback(cachedSettings);
    });
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
      collectionsSyncFolders: res.collectionsSyncFolders !== false,
      folderSyncState: sanitizeFolderSyncState(res.folderSyncState) || {
        dismissedFolderIds: [],
        userLockedUrls: [],
        promotedBarItems: [],
        archivedCollections: []
      },
      barBookmarksOrder: sanitizeBarBookmarksOrder(res.barBookmarksOrder) || []
    });
    cachedSettings = merged;
    isCacheReady = true;
    chrome.storage.local.set(merged, () => {
      reconcileBookmarksAndPersist({ broadcastTabs: true });
    });
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
      } else if (key === "folderSyncState") {
        cachedSettings.folderSyncState = sanitizeFolderSyncState(changes[key].newValue) || {
          dismissedFolderIds: [],
          userLockedUrls: [],
          promotedBarItems: [],
          archivedCollections: []
        };
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
    changes.collectionsSyncFolders ||
    changes.collectionsShowAddedOnBar ||
    changes.collectionsAllowDuplicateItems ||
    changes.folderSyncState ||
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

function generateCollectionIdBg() {
  const bytes = new Uint8Array(5);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const randHex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `col_${Date.now().toString(36)}_${randHex}`;
}

function pickRandomCollectionColorBg(avoidHex = "") {
  const pool =
    avoidHex && SYNC_COLLECTION_COLORS.length > 1
      ? SYNC_COLLECTION_COLORS.filter((c) => c !== avoidHex)
      : SYNC_COLLECTION_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeSafeBookmarkUrl(rawUrl) {
  if (!isSafeHttpUrl(rawUrl)) return "";
  try {
    return new URL(rawUrl).toString();
  } catch (e) {
    return "";
  }
}

function sanitizeBookmarkTitle(rawTitle, fallbackUrl = "") {
  const cleaned =
    typeof rawTitle === "string"
      ? rawTitle.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 200)
      : "";
  return cleaned || fallbackUrl;
}

function sanitizeFolderTitle(rawTitle) {
  const cleaned =
    typeof rawTitle === "string"
      ? rawTitle.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 60)
      : "";
  return cleaned || "Pasta";
}

function isBookmarksBarRootNode(node, index) {
  if (!node || typeof node !== "object") return false;
  if (node.folderType === "bookmarks-bar") return true;
  if (String(node.id) === "1") return true;
  return index === 0 && !node.folderType;
}

// Lê toda a árvore de favoritos do Edge/Chrome (somente leitura) extraindo pastas, barra e índice global de URLs válidas
function inspectBrowserBookmarkTree(tree) {
  const rootChildren = Array.isArray(tree?.[0]?.children) ? tree[0].children : [];
  let barRootIndex = rootChildren.findIndex((n, idx) => isBookmarksBarRootNode(n, idx));
  if (barRootIndex < 0 && rootChildren.length > 0) barRootIndex = 0;

  const bookmarksBarRoot = barRootIndex >= 0 ? rootChildren[barRootIndex] : null;
  const bookmarksBarId = bookmarksBarRoot && bookmarksBarRoot.id != null ? String(bookmarksBarRoot.id) : "1";
  const barRootChildren = Array.isArray(bookmarksBarRoot?.children) ? bookmarksBarRoot.children : [];

  const allBookmarksByUrl = new Map();
  const allBookmarksById = new Map();
  const barLooseUrlSet = new Set();
  const allFoldersById = new Map();

  for (const child of barRootChildren) {
    if (child && child.url) {
      const norm = normalizeSafeBookmarkUrl(child.url);
      if (norm) barLooseUrlSet.add(norm);
    }
  }

  const registerBookmarkLeaf = (node) => {
    if (!node || !node.url) return null;
    const normUrl = normalizeSafeBookmarkUrl(node.url);
    if (!normUrl) return null;
    const rawId = String(node.id || "");
    const safeId = BOOKMARK_ID_REGEX.test(rawId) ? rawId : `bm_${Math.random().toString(36).slice(2, 10)}`;
    const entry = {
      id: safeId,
      title: sanitizeBookmarkTitle(node.title, normUrl),
      url: normUrl
    };
    if (!allBookmarksByUrl.has(normUrl)) {
      allBookmarksByUrl.set(normUrl, entry);
    }
    if (BOOKMARK_ID_REGEX.test(rawId)) {
      allBookmarksById.set(rawId, entry);
    }
    return entry;
  };

  const walkContainerChildren = (children, inBookmarksBar) => {
    if (!Array.isArray(children)) return;
    // Registra links soltos deste nível no índice global de favoritos válidos
    for (const node of children) {
      if (node && node.url) {
        registerBookmarkLeaf(node);
      }
    }
    // Percorre subpastas do usuário (em pré-ordem)
    for (const node of children) {
      if (!node || node.url || !Array.isArray(node.children)) continue;
      const rawFolderId = String(node.id || "");
      if (!BOOKMARK_ID_REGEX.test(rawFolderId)) continue;

      const directBookmarks = [];
      const seenDirectUrls = new Set();
      for (const child of node.children) {
        if (child && child.url && directBookmarks.length < MAX_COLLECTION_ITEMS) {
          const leaf = registerBookmarkLeaf(child);
          if (leaf && !seenDirectUrls.has(leaf.url)) {
            seenDirectUrls.add(leaf.url);
            directBookmarks.push(leaf);
          }
        }
      }

      if (!allFoldersById.has(rawFolderId)) {
        allFoldersById.set(rawFolderId, {
          folderId: rawFolderId,
          folderName: sanitizeFolderTitle(node.title),
          inBookmarksBar,
          directBookmarks
        });
      }

      walkContainerChildren(node.children, inBookmarksBar);
    }
  };

  // Percorre primeiro a "Barra de favoritos" e em seguida "Outros favoritos" / "Favoritos móveis"
  if (bookmarksBarRoot) {
    walkContainerChildren(bookmarksBarRoot.children, true);
  }
  rootChildren.forEach((rootNode, idx) => {
    if (idx === barRootIndex || !rootNode || !Array.isArray(rootNode.children)) return;
    walkContainerChildren(rootNode.children, false);
  });

  return {
    bookmarksBarId,
    barRootChildren,
    barLooseUrlSet,
    allBookmarksByUrl,
    allBookmarksById,
    allFoldersById
  };
}

function buildBarItemsFromSnapshot(snapshot, settings) {
  const syncFoldersGlobal = settings.collectionsSyncFolders !== false;
  const collections = Array.isArray(settings.collections) ? settings.collections : [];
  const syncState = settings.folderSyncState || DEFAULT_FOLDER_SYNC_STATE;

  const barItems = [];
  const seenBarUrls = new Set();

  for (const node of snapshot.barRootChildren) {
    if (!node) continue;
    if (node.url) {
      const normUrl = normalizeSafeBookmarkUrl(node.url);
      if (!normUrl) continue;
      seenBarUrls.add(normUrl);
      barItems.push({
        id: String(node.id || ""),
        title: typeof node.title === "string" ? node.title : "",
        url: normUrl
      });
    }
    // Pastas nativas não duplicam na barra:
    // - Com "Sincronizar com suas pastas" ativo, as pastas tornam-se Coleções.
    // - Com "Sincronizar somente Barra de favoritos", sincroniza apenas os favoritos soltos da barra (sem as pastas).
  }

  // Favoritos movidos de pastas sincronizadas para a barra ou de coleções sincronizadas apagadas aparecem quando o sync de pastas está ativo
  if (syncFoldersGlobal) {
    const promoted = Array.isArray(syncState.promotedBarItems) ? syncState.promotedBarItems : [];
    for (const pItem of promoted) {
      if (!pItem || !pItem.url) continue;
      const normUrl = normalizeSafeBookmarkUrl(pItem.url);
      if (!normUrl || seenBarUrls.has(normUrl)) continue;
      if (!snapshot.allBookmarksByUrl.has(normUrl)) continue;

      const fresh = snapshot.allBookmarksById.get(pItem.id) || snapshot.allBookmarksByUrl.get(normUrl);
      seenBarUrls.add(normUrl);
      barItems.push({
        id: String(fresh?.id || pItem.id),
        title: fresh?.title ?? pItem.title ?? "",
        url: normUrl
      });
    }
  }

  // Se o usuário ativou "Mostrar favorito adicionado na barra", garante que favoritos de coleções oriundos de pastas também constem na lista da barra
  if (settings.collectionsShowAddedOnBar) {
    for (const col of collections) {
      if (!col || !Array.isArray(col.items)) continue;
      for (const it of col.items) {
        if (!it || !it.url) continue;
        const normUrl = normalizeSafeBookmarkUrl(it.url);
        if (!normUrl || seenBarUrls.has(normUrl)) continue;
        if (!snapshot.allBookmarksByUrl.has(normUrl)) continue;
        const fresh = snapshot.allBookmarksById.get(it.id) || snapshot.allBookmarksByUrl.get(normUrl);
        seenBarUrls.add(normUrl);
        barItems.push({
          id: String(fresh?.id || it.id),
          title: fresh?.title ?? it.title ?? "",
          url: normUrl
        });
      }
    }
  }

  return barItems;
}

// Reconcilia de forma não-destrutiva as pastas do navegador com as Coleções do My New Tab (sem jamais alterar chrome.bookmarks)
function reconcileWithTreeSnapshot(snapshot) {
  const prevCollections = Array.isArray(cachedSettings.collections) ? cachedSettings.collections : [];
  const prevSyncState = cachedSettings.folderSyncState || DEFAULT_FOLDER_SYNC_STATE;
  const syncFoldersGlobal = cachedSettings.collectionsSyncFolders !== false;
  const allowDuplicates = Boolean(cachedSettings.collectionsAllowDuplicateItems);

  const dismissedSet = new Set(
    (Array.isArray(prevSyncState.dismissedFolderIds) ? prevSyncState.dismissedFolderIds : []).filter((fid) =>
      snapshot.allFoldersById.has(fid)
    )
  );

  const lockedUrlsSet = new Set(
    (Array.isArray(prevSyncState.userLockedUrls) ? prevSyncState.userLockedUrls : []).filter((u) =>
      snapshot.allBookmarksByUrl.has(u)
    )
  );

  const promotedMap = new Map();
  if (Array.isArray(prevSyncState.promotedBarItems)) {
    for (const p of prevSyncState.promotedBarItems) {
      if (!p || !p.url) continue;
      const norm = normalizeSafeBookmarkUrl(p.url);
      if (!norm || !snapshot.allBookmarksByUrl.has(norm) || promotedMap.has(norm)) continue;
      const fresh = snapshot.allBookmarksById.get(p.id) || snapshot.allBookmarksByUrl.get(norm);
      promotedMap.set(norm, {
        id: String(fresh?.id || p.id),
        title: sanitizeBookmarkTitle(fresh?.title || p.title, norm),
        url: norm
      });
    }
  }

  const prevArchived = Array.isArray(prevSyncState.archivedCollections) ? prevSyncState.archivedCollections : [];

  // Se reativou "Sincronizar com suas pastas", restaura coleções sincronizadas arquivadas anteriormente
  let workingCollections = prevCollections;
  if (syncFoldersGlobal && prevArchived.length > 0) {
    const activeFolderIds = new Set(prevCollections.map((c) => c?.syncedFolderId).filter(Boolean));
    const manualUrlsSet = new Set();
    if (!allowDuplicates) {
      for (const c of prevCollections) {
        if (c && !c.syncedFolderId && Array.isArray(c.items)) {
          for (const it of c.items) {
            if (it?.url) manualUrlsSet.add(it.url);
          }
        }
      }
    }
    const restored = [];
    for (const arch of prevArchived) {
      if (!arch || !arch.syncedFolderId || activeFolderIds.has(arch.syncedFolderId)) continue;
      activeFolderIds.add(arch.syncedFolderId);
      const filteredItems =
        !allowDuplicates && Array.isArray(arch.items)
          ? arch.items.filter((it) => it && !manualUrlsSet.has(it.url))
          : arch.items;
      restored.push({ ...arch, items: filteredItems });
    }
    workingCollections = [...restored, ...prevCollections];
  }

  // Passo A: Varredura global de desfavoritados (qualquer item removido dos favoritos do navegador sai do My New Tab)
  const cleanCollectionItems = (col) => {
    const cleanItems = (Array.isArray(col.items) ? col.items : [])
      .map((it) => {
        if (!it || !it.url) return null;
        const norm = normalizeSafeBookmarkUrl(it.url);
        if (!norm || !snapshot.allBookmarksByUrl.has(norm)) return null;
        const fresh = snapshot.allBookmarksById.get(it.id) || snapshot.allBookmarksByUrl.get(norm);
        return {
          id: String(fresh?.id || it.id),
          title: sanitizeBookmarkTitle(fresh?.title || it.title, norm),
          url: norm
        };
      })
      .filter(Boolean);

    const copy = {
      ...col,
      items: cleanItems
    };
    if (Array.isArray(col.knownFolderUrls)) {
      copy.knownFolderUrls = col.knownFolderUrls.slice();
    }
    return copy;
  };

  let nextCollections = workingCollections.map(cleanCollectionItems);
  let nextArchived = [];

  if (!syncFoldersGlobal) {
    // Modo "Sincronizar somente Barra de favoritos" (sem as pastas):
    // Arquiva coleções sincronizadas (preservando personalizações caso o usuário volte a ativar) e mantém apenas coleções manuais
    const archivedByFolderId = new Map();
    for (const col of nextCollections) {
      if (col.syncedFolderId && snapshot.allFoldersById.has(col.syncedFolderId)) {
        archivedByFolderId.set(col.syncedFolderId, col);
      }
    }
    for (const arch of prevArchived) {
      if (
        arch &&
        arch.syncedFolderId &&
        snapshot.allFoldersById.has(arch.syncedFolderId) &&
        !archivedByFolderId.has(arch.syncedFolderId)
      ) {
        archivedByFolderId.set(arch.syncedFolderId, cleanCollectionItems(arch));
      }
    }
    nextArchived = Array.from(archivedByFolderId.values()).slice(0, MAX_COLLECTIONS);
    nextCollections = nextCollections.filter((col) => !col.syncedFolderId);
  } else {
    const displacedOrphanCandidates = [];

    // Passo B: Tratamento de pastas apagadas no navegador
    nextCollections = nextCollections.filter((col) => {
      if (!col.syncedFolderId) return true;
      if (snapshot.allFoldersById.has(col.syncedFolderId)) return true;

      // Se o usuário havia pausado a sincronização desta coleção, desvincula da pasta apagada e preserva a coleção
      if (col.syncEnabled === false) {
        delete col.syncedFolderId;
        delete col.syncedFolderName;
        delete col.syncEnabled;
        delete col.nameCustomized;
        delete col.orderCustomized;
        delete col.knownFolderUrls;
        return true;
      }

      // Pasta sincronizada foi apagada no navegador: itens sobreviventes (movidos para fora antes de apagar) ficam elegíveis
      for (const it of col.items) {
        if (snapshot.allBookmarksByUrl.has(it.url)) {
          displacedOrphanCandidates.push(it);
        }
      }
      return false;
    });

    // Passo D1: Atualiza metadados das pastas e remove itens que saíram da pasta no navegador (salvo se travados pelo usuário no My New Tab)
    for (const col of nextCollections) {
      if (!col.syncedFolderId) continue;
      const folder = snapshot.allFoldersById.get(col.syncedFolderId);
      if (!folder) continue;

      col.syncedFolderName = folder.folderName;
      if (col.syncEnabled === false) continue;

      if (!col.nameCustomized) {
        col.name = folder.folderName;
      }

      const currentFolderUrls = new Set(folder.directBookmarks.map((b) => b.url));
      const prevKnownSet = new Set(Array.isArray(col.knownFolderUrls) ? col.knownFolderUrls : []);

      col.items = col.items.filter((it) => {
        if (currentFolderUrls.has(it.url)) return true;
        // Se o item estava na pasta antes e não foi movido manualmente no My New Tab, acompanha a saída da pasta no navegador
        if (prevKnownSet.has(it.url) && !lockedUrlsSet.has(it.url)) {
          if (snapshot.allBookmarksByUrl.has(it.url)) {
            displacedOrphanCandidates.push(it);
          }
          return false;
        }
        return true;
      });
    }

    // Passo D2: Adiciona novos favoritos das pastas às coleções existentes e cria coleções para pastas novas
    const claimedUrls = new Set();
    for (const col of nextCollections) {
      for (const it of col.items) {
        claimedUrls.add(it.url);
      }
    }

    for (const col of nextCollections) {
      if (!col.syncedFolderId) continue;
      const folder = snapshot.allFoldersById.get(col.syncedFolderId);
      if (!folder || col.syncEnabled === false) continue;

      const prevKnownSet = new Set(Array.isArray(col.knownFolderUrls) ? col.knownFolderUrls : []);
      const existingInCol = new Set(col.items.map((it) => it.url));

      for (const bm of folder.directBookmarks) {
        if (col.items.length >= MAX_COLLECTION_ITEMS) break;
        const isNewInFolder = !prevKnownSet.has(bm.url);
        if (isNewInFolder && !existingInCol.has(bm.url) && !lockedUrlsSet.has(bm.url)) {
          if (allowDuplicates || !claimedUrls.has(bm.url)) {
            col.items.push({ id: bm.id, title: bm.title, url: bm.url });
            existingInCol.add(bm.url);
            claimedUrls.add(bm.url);
            if (!lockedUrlsSet.has(bm.url)) {
              promotedMap.delete(bm.url);
            }
          }
        }
      }

      // Se o usuário não customizou a ordem nem adicionou/removeu itens manualmente, acompanha a ordem da pasta do navegador
      if (
        !col.orderCustomized &&
        col.items.length === folder.directBookmarks.length &&
        folder.directBookmarks.every((bm) => existingInCol.has(bm.url))
      ) {
        const byUrl = new Map(col.items.map((it) => [it.url, it]));
        col.items = folder.directBookmarks.map((bm) => byUrl.get(bm.url) || { id: bm.id, title: bm.title, url: bm.url });
      }

      col.knownFolderUrls = folder.directBookmarks.map((b) => b.url);
    }

    // Cria coleções automáticas para pastas novas
    const existingSyncedFolderIds = new Set(nextCollections.map((c) => c.syncedFolderId).filter(Boolean));
    for (const folder of snapshot.allFoldersById.values()) {
      if (nextCollections.length >= MAX_COLLECTIONS) break;
      if (dismissedSet.has(folder.folderId)) continue;
      if (existingSyncedFolderIds.has(folder.folderId)) continue;

      const items = [];
      for (const bm of folder.directBookmarks) {
        if (items.length >= MAX_COLLECTION_ITEMS) break;
        if (lockedUrlsSet.has(bm.url) && !allowDuplicates && claimedUrls.has(bm.url)) continue;
        if (!allowDuplicates && claimedUrls.has(bm.url)) continue;
        items.push({ id: bm.id, title: bm.title, url: bm.url });
        claimedUrls.add(bm.url);
        if (!lockedUrlsSet.has(bm.url)) {
          promotedMap.delete(bm.url);
        }
      }

      const prevColor = nextCollections.length > 0 ? nextCollections[nextCollections.length - 1].color : "";
      nextCollections.push({
        id: generateCollectionIdBg(),
        name: folder.folderName,
        emoji: "",
        color: pickRandomCollectionColorBg(prevColor),
        hidden: false,
        items,
        syncedFolderId: folder.folderId,
        syncedFolderName: folder.folderName,
        syncEnabled: true,
        nameCustomized: false,
        orderCustomized: false,
        knownFolderUrls: folder.directBookmarks.map((b) => b.url)
      });
      existingSyncedFolderIds.add(folder.folderId);
    }

    // Se algum favorito saiu de uma pasta sincronizada para fora das pastas (ex: "Outros favoritos") e segue favoritado, envia para a barra
    if (displacedOrphanCandidates.length > 0) {
      for (const orphan of displacedOrphanCandidates) {
        if (promotedMap.size >= MAX_BAR_ORDER_ITEMS) break;
        if (
          !claimedUrls.has(orphan.url) &&
          !snapshot.barLooseUrlSet.has(orphan.url) &&
          snapshot.allBookmarksByUrl.has(orphan.url) &&
          !promotedMap.has(orphan.url)
        ) {
          promotedMap.set(orphan.url, orphan);
        }
      }
    }
  }

  const nextSyncState = {
    dismissedFolderIds: Array.from(dismissedSet).slice(0, MAX_DISMISSED_FOLDERS),
    userLockedUrls: Array.from(lockedUrlsSet).slice(0, MAX_LOCKED_URLS),
    promotedBarItems: Array.from(promotedMap.values()).slice(0, MAX_BAR_ORDER_ITEMS),
    archivedCollections: nextArchived
  };

  const collectionsChanged = JSON.stringify(prevCollections) !== JSON.stringify(nextCollections);
  const syncStateChanged = JSON.stringify(prevSyncState) !== JSON.stringify(nextSyncState);

  if (collectionsChanged) {
    cachedSettings.collections = nextCollections;
  }
  if (syncStateChanged) {
    cachedSettings.folderSyncState = nextSyncState;
  }

  return {
    collectionsChanged,
    syncStateChanged,
    anyChanged: collectionsChanged || syncStateChanged
  };
}

function reconcileBookmarksAndPersist(options = {}, callback) {
  const { broadcastTabs = false, movedInfos = [] } = options;

  bookmarkSyncChain = bookmarkSyncChain
    .catch(() => {})
    .then(
      () =>
        new Promise((resolve) => {
          chrome.bookmarks.getTree((tree) => {
            const snapshot = inspectBrowserBookmarkTree(tree);
            const diff = reconcileWithTreeSnapshot(snapshot);
            const toPersist = {};

            if (diff.collectionsChanged) {
              toPersist.collections = cachedSettings.collections;
            }
            if (diff.syncStateChanged) {
              toPersist.folderSyncState = cachedSettings.folderSyncState;
            }

            // Se houve movimentação nativa na Barra de favoritos do navegador, preserva os itens promovidos na ordem da barra
            if (
              movedInfos.length > 0 &&
              Array.isArray(cachedSettings.barBookmarksOrder) &&
              cachedSettings.barBookmarksOrder.length > 0
            ) {
              const touchedBar = movedInfos.some(
                (info) =>
                  info &&
                  (String(info.parentId) === snapshot.bookmarksBarId ||
                    String(info.oldParentId) === snapshot.bookmarksBarId)
              );
              if (touchedBar) {
                const barItemsNow = buildBarItemsFromSnapshot(snapshot, cachedSettings);
                const nativeIds = snapshot.barRootChildren
                  .filter((n) => n && n.url && normalizeSafeBookmarkUrl(n.url))
                  .map((n) => String(n.id))
                  .filter(Boolean);
                const nativeIdSet = new Set(nativeIds);
                const promotedIds = barItemsNow
                  .map((n) => String(n.id || ""))
                  .filter((id) => id && !nativeIdSet.has(id));
                const nextOrder = sanitizeBarBookmarksOrder([...nativeIds, ...promotedIds]) || [];
                if (JSON.stringify(cachedSettings.barBookmarksOrder) !== JSON.stringify(nextOrder)) {
                  cachedSettings.barBookmarksOrder = nextOrder;
                  toPersist.barBookmarksOrder = nextOrder;
                }
              }
            }

            const barItems = buildBarItemsFromSnapshot(snapshot, cachedSettings);

            const finish = () => {
              if (broadcastTabs) {
                chrome.tabs.query({}, (tabs) => {
                  tabs.forEach((tab) => {
                    if (typeof tab.id === "number") {
                      chrome.tabs.sendMessage(tab.id, { action: "bookmarksUpdated", items: barItems }).catch(() => {});
                    }
                  });
                });
              }
              if (callback) callback(barItems);
              resolve(barItems);
            };

            if (Object.keys(toPersist).length > 0) {
              chrome.storage.local.set(toPersist, finish);
            } else {
              finish();
            }
          });
        })
    );

  return bookmarkSyncChain;
}

function scheduleBrowserBookmarkSync(movedInfo = null) {
  if (movedInfo) {
    pendingMovedBookmarkInfos.push(movedInfo);
  }
  clearTimeout(bookmarkEventDebounceTimer);
  bookmarkEventDebounceTimer = setTimeout(() => {
    const movedBatch = pendingMovedBookmarkInfos.slice();
    pendingMovedBookmarkInfos = [];
    const run = () => {
      reconcileBookmarksAndPersist({ broadcastTabs: true, movedInfos: movedBatch });
    };
    if (isCacheReady) run();
    else syncSettingsCache(run);
  }, 50);
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

chrome.bookmarks.onCreated.addListener(() => scheduleBrowserBookmarkSync());
chrome.bookmarks.onRemoved.addListener(() => scheduleBrowserBookmarkSync());
chrome.bookmarks.onChanged.addListener(() => scheduleBrowserBookmarkSync());
chrome.bookmarks.onMoved.addListener((_id, moveInfo) => scheduleBrowserBookmarkSync(moveInfo));
if (chrome.bookmarks.onChildrenReordered && typeof chrome.bookmarks.onChildrenReordered.addListener === "function") {
  chrome.bookmarks.onChildrenReordered.addListener(() => scheduleBrowserBookmarkSync());
}
if (chrome.bookmarks.onImportEnded && typeof chrome.bookmarks.onImportEnded.addListener === "function") {
  chrome.bookmarks.onImportEnded.addListener(() => scheduleBrowserBookmarkSync());
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Garante que apenas scripts da própria extensão possam se comunicar com o Service Worker
  if (sender.id !== chrome.runtime.id || !request || typeof request.action !== "string") {
    return false;
  }

  if (request.action === "initData") {
    const respond = () => {
      reconcileBookmarksAndPersist({ broadcastTabs: false }, (items) => {
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

      const needsTreeReconcile = sanitized.collectionsSyncFolders !== undefined;
      const needsBarItemsRefresh =
        needsTreeReconcile ||
        sanitized.folderSyncState !== undefined ||
        sanitized.collections !== undefined ||
        sanitized.collectionsShowAddedOnBar !== undefined;

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

        if (needsTreeReconcile) {
          reconcileBookmarksAndPersist({ broadcastTabs: true }, (items) => {
            sendResponse({ ok: true, settings: cachedSettings, items });
          });
          return;
        }

        if (needsBarItemsRefresh) {
          chrome.bookmarks.getTree((tree) => {
            const snapshot = inspectBrowserBookmarkTree(tree);
            const items = buildBarItemsFromSnapshot(snapshot, cachedSettings);
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach((tab) => {
                if (typeof tab.id === "number") {
                  chrome.tabs.sendMessage(tab.id, { action: "bookmarksUpdated", items }).catch(() => {});
                }
              });
            });
            sendResponse({ ok: true, settings: cachedSettings, items });
          });
          return;
        }

        sendResponse({ ok: true, settings: cachedSettings });
      });
    };
    if (isCacheReady) applyUpdate();
    else syncSettingsCache(applyUpdate);
    return true;
  }

  if (request.action === "setCollectionFolderSync") {
    const handleSetSync = () => {
      const colId = typeof request.colId === "string" ? request.colId : "";
      if (!COLLECTION_ID_REGEX.test(colId) || typeof request.enabled !== "boolean") {
        sendResponse({ ok: false });
        return;
      }

      const list = Array.isArray(cachedSettings.collections) ? cachedSettings.collections : [];
      const idx = list.findIndex((c) => c && c.id === colId && c.syncedFolderId);
      if (idx < 0) {
        sendResponse({ ok: false });
        return;
      }

      const nextList = list.slice();
      nextList[idx] = {
        ...nextList[idx],
        syncEnabled: request.enabled
      };
      cachedSettings.collections = nextList;

      chrome.storage.local.set({ collections: cachedSettings.collections }, () => {
        if (request.enabled && cachedSettings.collectionsSyncFolders !== false) {
          reconcileBookmarksAndPersist({ broadcastTabs: true }, (items) => {
            sendResponse({ ok: true, settings: cachedSettings, items });
          });
        } else {
          chrome.bookmarks.getTree((tree) => {
            const snapshot = inspectBrowserBookmarkTree(tree);
            const items = buildBarItemsFromSnapshot(snapshot, cachedSettings);
            sendResponse({ ok: true, settings: cachedSettings, items });
          });
        }
      });
    };
    if (isCacheReady) handleSetSync();
    else syncSettingsCache(handleSetSync);
    return true;
  }

  if (request.action === "resyncCollection") {
    const handleResync = () => {
      const colId = typeof request.colId === "string" ? request.colId : "";
      if (!COLLECTION_ID_REGEX.test(colId)) {
        sendResponse({ ok: false });
        return;
      }

      chrome.bookmarks.getTree((tree) => {
        const snapshot = inspectBrowserBookmarkTree(tree);
        const list = Array.isArray(cachedSettings.collections) ? cachedSettings.collections : [];
        const idx = list.findIndex((c) => c && c.id === colId && c.syncedFolderId);
        if (idx < 0) {
          sendResponse({ ok: false });
          return;
        }

        const targetCol = list[idx];
        const folder = snapshot.allFoldersById.get(targetCol.syncedFolderId);
        if (!folder) {
          sendResponse({ ok: false, error: "folder_not_found" });
          return;
        }

        const folderUrlSet = new Set(folder.directBookmarks.map((b) => b.url));
        const prevSyncState = cachedSettings.folderSyncState || DEFAULT_FOLDER_SYNC_STATE;
        const nextLockedUrls = (Array.isArray(prevSyncState.userLockedUrls) ? prevSyncState.userLockedUrls : []).filter(
          (u) => !folderUrlSet.has(u)
        );
        const nextPromoted = (
          Array.isArray(prevSyncState.promotedBarItems) ? prevSyncState.promotedBarItems : []
        ).filter((p) => !p || !folderUrlSet.has(p.url));

        const allowDuplicates = Boolean(cachedSettings.collectionsAllowDuplicateItems);
        const nextCollections = list.map((c, i) => {
          if (i === idx) {
            return {
              ...c,
              name: folder.folderName,
              emoji: "",
              hidden: false,
              syncedFolderName: folder.folderName,
              syncEnabled: true,
              nameCustomized: false,
              orderCustomized: false,
              items: folder.directBookmarks.map((b) => ({ id: b.id, title: b.title, url: b.url })),
              knownFolderUrls: folder.directBookmarks.map((b) => b.url)
            };
          }
          if (!allowDuplicates && Array.isArray(c.items)) {
            return {
              ...c,
              items: c.items.filter((it) => !it || !folderUrlSet.has(it.url))
            };
          }
          return c;
        });

        cachedSettings.collections = nextCollections;
        cachedSettings.folderSyncState = {
          dismissedFolderIds: Array.isArray(prevSyncState.dismissedFolderIds)
            ? prevSyncState.dismissedFolderIds.slice()
            : [],
          userLockedUrls: nextLockedUrls,
          promotedBarItems: nextPromoted,
          archivedCollections: Array.isArray(prevSyncState.archivedCollections)
            ? prevSyncState.archivedCollections.slice()
            : []
        };

        const barItems = buildBarItemsFromSnapshot(snapshot, cachedSettings);
        chrome.storage.local.set(
          {
            collections: cachedSettings.collections,
            folderSyncState: cachedSettings.folderSyncState
          },
          () => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach((tab) => {
                if (typeof tab.id === "number") {
                  chrome.tabs.sendMessage(tab.id, { action: "bookmarksUpdated", items: barItems }).catch(() => {});
                }
              });
            });
            sendResponse({ ok: true, settings: cachedSettings, items: barItems });
          }
        );
      });
    };
    if (isCacheReady) handleResync();
    else syncSettingsCache(handleResync);
    return true;
  }

  if (request.action === "resyncAllCollections") {
    const handleResyncAll = () => {
      chrome.bookmarks.getTree((tree) => {
        const snapshot = inspectBrowserBookmarkTree(tree);
        const prevList = Array.isArray(cachedSettings.collections) ? cachedSettings.collections : [];
        const prevArchived = Array.isArray(cachedSettings.folderSyncState?.archivedCollections)
          ? cachedSettings.folderSyncState.archivedCollections
          : [];
        const allowDuplicates = Boolean(cachedSettings.collectionsAllowDuplicateItems);

        const existingByFolderId = new Map();
        for (const c of prevList) {
          if (c && c.syncedFolderId) existingByFolderId.set(c.syncedFolderId, c);
        }
        for (const c of prevArchived) {
          if (c && c.syncedFolderId && !existingByFolderId.has(c.syncedFolderId)) {
            existingByFolderId.set(c.syncedFolderId, c);
          }
        }

        const claimedFolderUrls = new Set();
        const rebuiltSynced = [];

        for (const folder of snapshot.allFoldersById.values()) {
          if (rebuiltSynced.length >= MAX_COLLECTIONS) break;
          const prevCol = existingByFolderId.get(folder.folderId);
          const prevColor = rebuiltSynced.length > 0 ? rebuiltSynced[rebuiltSynced.length - 1].color : "";
          const items = [];

          for (const bm of folder.directBookmarks) {
            if (items.length >= MAX_COLLECTION_ITEMS) break;
            if (!allowDuplicates && claimedFolderUrls.has(bm.url)) continue;
            items.push({ id: bm.id, title: bm.title, url: bm.url });
            claimedFolderUrls.add(bm.url);
          }

          rebuiltSynced.push({
            id: prevCol && COLLECTION_ID_REGEX.test(prevCol.id) ? prevCol.id : generateCollectionIdBg(),
            name: folder.folderName,
            emoji: "",
            color: prevCol && HEX_COLOR_REGEX.test(prevCol.color) ? prevCol.color : pickRandomCollectionColorBg(prevColor),
            hidden: false,
            items,
            syncedFolderId: folder.folderId,
            syncedFolderName: folder.folderName,
            syncEnabled: true,
            nameCustomized: false,
            orderCustomized: false,
            knownFolderUrls: folder.directBookmarks.map((b) => b.url)
          });
        }

        const manualLockedUrls = [];
        const manualCollections = [];
        for (const c of prevList) {
          if (!c || c.syncedFolderId) continue;
          if (rebuiltSynced.length + manualCollections.length >= MAX_COLLECTIONS) break;
          const cleanManualItems = (Array.isArray(c.items) ? c.items : []).filter((it) => {
            if (!it || !it.url || !snapshot.allBookmarksByUrl.has(it.url)) return false;
            if (!allowDuplicates && claimedFolderUrls.has(it.url)) return false;
            return true;
          });
          for (const it of cleanManualItems) {
            manualLockedUrls.push(it.url);
          }
          manualCollections.push({
            ...c,
            items: cleanManualItems
          });
        }

        cachedSettings.collectionsSyncFolders = true;
        cachedSettings.collections = [...rebuiltSynced, ...manualCollections];
        cachedSettings.folderSyncState = {
          dismissedFolderIds: [],
          userLockedUrls: Array.from(new Set(manualLockedUrls)).slice(0, MAX_LOCKED_URLS),
          promotedBarItems: [],
          archivedCollections: []
        };

        const barItems = buildBarItemsFromSnapshot(snapshot, cachedSettings);
        chrome.storage.local.set(
          {
            collectionsSyncFolders: true,
            collections: cachedSettings.collections,
            folderSyncState: cachedSettings.folderSyncState
          },
          () => {
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach((tab) => {
                if (typeof tab.id === "number") {
                  chrome.tabs.sendMessage(tab.id, { action: "bookmarksUpdated", items: barItems }).catch(() => {});
                }
              });
            });
            sendResponse({ ok: true, settings: cachedSettings, items: barItems });
          }
        );
      });
    };
    if (isCacheReady) handleResyncAll();
    else syncSettingsCache(handleResyncAll);
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