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

const RGBA_COLOR_REGEX = /^rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([01](?:\.\d+)?)\)$/;

function applyCanvasColor(bgBar) {
  if (typeof bgBar !== "string") return;
  const match = bgBar.match(RGBA_COLOR_REGEX);
  if (!match) return;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if (r <= 255 && g <= 255 && b <= 255) {
    document.documentElement.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
}

try {
  const cachedBg = localStorage.getItem("mnt_newtab_bg");
  if (cachedBg) applyCanvasColor(cachedBg);
} catch (e) {}

function isSafeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

chrome.storage.local.get({ engine: "google", customSites: [], acceleration: true, themeCache: {} }, (res) => {
  let activeKey = "google";
  let target = ENGINES.google;
  let isPredefined = true;

  if (typeof res.engine === "string" && Object.prototype.hasOwnProperty.call(ENGINES, res.engine)) {
    activeKey = res.engine;
    target = ENGINES[activeKey];
  } else if (typeof res.engine === "string" && res.engine.startsWith("custom_") && Array.isArray(res.customSites)) {
    const found = res.customSites.find((s) => s && s.id === res.engine && isSafeHttpsUrl(s.url));
    if (found) {
      activeKey = found.id;
      target = found.url;
      isPredefined = false;
    }
  }

  const cachedTheme = res.themeCache && res.themeCache[activeKey];
  if (cachedTheme && cachedTheme.bgBar) {
    applyCanvasColor(cachedTheme.bgBar);
    try {
      localStorage.setItem("mnt_newtab_bg", cachedTheme.bgBar);
    } catch (e) {}
  }

  if (isPredefined && res.acceleration && document.head) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = new URL(target).origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  chrome.runtime.sendMessage({ action: "redirectNewTab" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) {
      window.location.replace(target);
    }
  });
});