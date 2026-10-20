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

chrome.storage.local.get({ engine: "google", acceleration: true, themeCache: {} }, (res) => {
  const engineKey = Object.prototype.hasOwnProperty.call(ENGINES, res.engine) ? res.engine : "google";
  const target = ENGINES[engineKey];

  const cachedTheme = res.themeCache && res.themeCache[engineKey];
  if (cachedTheme && cachedTheme.bgBar) {
    applyCanvasColor(cachedTheme.bgBar);
    try {
      localStorage.setItem("mnt_newtab_bg", cachedTheme.bgBar);
    } catch (e) {}
  }

  if (res.acceleration && document.head) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = new URL(target).origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  if (chrome.tabs && chrome.tabs.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (tab && (tab.pendingUrl === target || tab.url === target)) {
        return;
      }
      window.location.replace(target);
    });
  } else {
    window.location.replace(target);
  }
});