(function () {
  if (window.top !== window.self) return;

  const LOCAL_THEME_KEY = "mnt_cached_theme_v1";
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


  let currentSettings = null;
  let currentBookmarks = [];
  let enginesMap = {};
  let ui = null;

  function detectCurrentEngine() {
    const host = window.location.hostname;
    if (host === "gemini.google.com") return "gemini";
    if (host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) return "chatgpt";
    if (host === "www.perplexity.ai" || host === "perplexity.ai" || host.endsWith(".perplexity.ai")) {
      return "perplexity";
    }
    if (host.includes("google.")) return "google";
    if (host.includes("duckduckgo.")) return "duckduckgo";
    if (host.includes("yahoo.")) return "yahoo";
    if (host.includes("brave.")) return "brave";
    return null;
  }

  function isSearchHomePage() {
    const engine = detectCurrentEngine();
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (engine === "google") {
      return (path === "/" || path === "/webhp") && !params.has("q");
    }
    if (engine === "duckduckgo") {
      return (path === "/" || path === "") && !params.has("q");
    }
    if (engine === "yahoo") {
      return !path.startsWith("/search") && !params.has("p");
    }
    if (engine === "brave") {
      return !path.startsWith("/search") && !params.has("q");
    }
    if (engine === "gemini") {
      return (path === "/" || path === "" || path === "/app" || path === "/app/") && !params.has("q");
    }
    if (engine === "claude") {
      return (path === "/" || path === "" || path === "/new" || path === "/new/") && !params.has("q");
    }
    if (engine === "chatgpt") {
      return (path === "/" || path === "") && !params.has("q");
    }
    if (engine === "perplexity") {
      return (path === "/" || path === "") && !params.has("q");
    }
    return false;
  }

  // Valida se a URL do favorito usa protocolo web seguro antes de renderizar ou buscar favicon
  function isSafeUrl(rawUrl) {
    if (typeof rawUrl !== "string") return false;
    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "16");
    return url.toString();
  }

  // Valida os dados de tema contra manipulação do localStorage pela página
  function isValidThemeData(data) {
    if (!data || typeof data !== "object") return false;
    if (data.theme !== "dark" && data.theme !== "light") return false;
    if (!data.bgBar || !isValidRgbaColor(data.bgBar)) {
      return false;
    }
    return true;
  }

  // Lê o tema memorizado anteriormente (0ms via localStorage ou fallback do storage da extensão)
  function getMemorizedTheme() {
    const engine = detectCurrentEngine();
    try {
      const raw = localStorage.getItem(LOCAL_THEME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidThemeData(parsed)) return parsed;
      }
    } catch (e) {}

    const cached = engine ? currentSettings?.themeCache?.[engine] : null;
    if (isValidThemeData(cached)) {
      try {
        localStorage.setItem(LOCAL_THEME_KEY, JSON.stringify(cached));
      } catch (e) {}
      return cached;
    }
    return null;
  }

  // Memoriza o tema validado para que a próxima abertura já carregue na cor certa
  function memorizeTheme(themeData) {
    if (!isValidThemeData(themeData)) return;
    const engine = detectCurrentEngine();
    try {
      localStorage.setItem(LOCAL_THEME_KEY, JSON.stringify(themeData));
    } catch (e) {}

    if (currentSettings && engine) {
      const updatedCache = { ...(currentSettings.themeCache || {}), [engine]: themeData };
      currentSettings.themeCache = updatedCache;
      chrome.runtime.sendMessage({
        action: "updateSettings",
        newSettings: { themeCache: updatedCache }
      });
    }
  }

  const ICONS = {
    folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5C1.5 2.67157 2.17157 2 3 2H6.17157C6.70201 2 7.21071 2.21071 7.58579 2.58579L8.41421 3.41421C8.78929 3.78929 9.29799 4 9.82843 4H13C13.8284 4 14.5 4.67157 14.5 5.5V12.5C14.5 13.3284 13.8284 14 13 14H3C2.17157 14 1.5 13.3284 1.5 12.5V3.5Z" fill="#F5B942" stroke="#D99B26" stroke-width="0.8"/></svg>`,
    more: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    chevronRight: `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4.5 2.25L8.25 6L4.5 9.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    starEdit: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.85 5.25L14 5.85L11 8.77L11.7 12.9L8 10.95L4.3 12.9L5 8.77L2 5.85L6.15 5.25L8 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`
  };

  chrome.runtime.sendMessage({ action: "initData" }, (response) => {
    if (!response) return;
    currentSettings = response.settings;
    currentBookmarks = response.items || [];
    enginesMap = response.engines || {};

    evaluateActivation();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === "bookmarksUpdated" && ui) {
      currentBookmarks = msg.items || [];
      renderBookmarksList();
    }
  });

  function evaluateActivation() {
    const activeEngine = detectCurrentEngine();
    if (!currentSettings || activeEngine !== currentSettings.engine) {
      destroyBar();
      return;
    }

    if (!ui) {
      mountBar();
    } else {
      updateBarVisibilityState();
    }
  }

  function destroyBar() {
    if (!ui) return;
    if (Array.isArray(ui.cleanupFns)) {
      ui.cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
    }
    clearFixedTopAttributes();
    const specScript = document.getElementById("mnt-speculation-rules");
    if (specScript) specScript.remove();
    ui.host.remove();
    ui.pageStyle.remove();
    ui = null;
  }

  function mountBar() {
    const host = document.createElement("div");
    host.id = "mnt-edge-bookmarks-host";
    // Modo "closed" impede que scripts externos da página leiam os favoritos do usuário
    const shadow = host.attachShadow({ mode: "closed" });

    const pageStyle = document.createElement("style");
    pageStyle.id = "mnt-edge-page-offset";

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 34px !important;
        z-index: 2147483647 !important;
        --mnt-font: 'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
        font-family: var(--mnt-font) !important;
        font-size: 12px !important;
        font-weight: 400 !important;
        font-style: normal !important;
        letter-spacing: normal !important;
        user-select: none;
        pointer-events: none;

        --bg-bar: rgba(247, 247, 247, 0.88);
        --border-bar: rgba(0, 0, 0, 0.08);
        --text-color: #1b1b1b;
        --text-muted: #5c5c5c;
        --hover-bg: rgba(0, 0, 0, 0.06);
        --active-bg: rgba(0, 0, 0, 0.10);
        --menu-bg: rgba(252, 252, 252, 0.96);
        --menu-border: rgba(0, 0, 0, 0.12);
        --menu-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.08);
        --divider: rgba(0, 0, 0, 0.08);
      }

      :host([data-theme="dark"]) {
        --bg-bar: rgba(32, 33, 36, 0.90);
        --border-bar: rgba(255, 255, 255, 0.10);
        --text-color: #f3f3f3;
        --text-muted: #a6a6a6;
        --hover-bg: rgba(255, 255, 255, 0.08);
        --active-bg: rgba(255, 255, 255, 0.13);
        --menu-bg: rgba(43, 43, 43, 0.96);
        --menu-border: rgba(255, 255, 255, 0.14);
        --menu-shadow: 0 8px 28px rgba(0, 0, 0, 0.50), 0 2px 6px rgba(0, 0, 0, 0.35);
        --divider: rgba(255, 255, 255, 0.10);
      }

      .bar-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 6px 0 8px;
        background-color: var(--bg-bar);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border-bottom: 1px solid var(--border-bar);
        box-sizing: border-box;
        pointer-events: auto;
        font-family: var(--mnt-font);
        font-size: 12px;
        font-weight: 400;
        font-style: normal;
        letter-spacing: normal;
        transform: translateY(0);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease;
      }

      .bar-wrapper.hidden {
        transform: translateY(-102%);
        box-shadow: none;
      }

      .bar-wrapper.floating-open {
        transform: translateY(0);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      }

      .bookmarks-strip {
        display: flex;
        align-items: center;
        gap: 2px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        flex: 1;
        height: 100%;
        padding-right: 6px;
      }

      .bookmarks-strip::-webkit-scrollbar {
        display: none;
      }

      .item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 8px;
        border-radius: 4px;
        color: var(--text-color);
        text-decoration: none;
        white-space: nowrap;
        max-width: 155px;
        cursor: pointer;
        transition: background-color 0.1s ease;
        flex-shrink: 0;
        border: none;
        background: transparent;
        font-family: var(--mnt-font);
        font-size: 12px;
        font-weight: 400;
        font-style: normal;
        letter-spacing: normal;
        line-height: 1;
      }

      .item:hover, .item.active {
        background-color: var(--hover-bg);
      }

      .item:active {
        background-color: var(--active-bg);
      }

      .item img, .item svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        border-radius: 2px;
      }

      .title {
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--mnt-font);
      }

      .more-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 24px;
        padding: 0;
        margin: 0;
        line-height: 0;
        box-sizing: border-box;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--text-color);
        opacity: 0.55;
        cursor: pointer;
        flex-shrink: 0;
        transition: background-color 0.1s ease, opacity 0.15s ease;
      }

      .more-btn svg {
        width: 15px;
        height: 15px;
        display: block;
        flex-shrink: 0;
      }

      .more-btn:hover, .more-btn.active {
        background-color: var(--hover-bg);
        opacity: 1;
      }

      .fluent-menu {
        position: fixed;
        min-width: 225px;
        background-color: var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 8px;
        box-shadow: var(--menu-shadow);
        padding: 4px;
        display: none;
        flex-direction: column;
        z-index: 2147483647;
        pointer-events: auto;
        font-family: var(--mnt-font);
        font-weight: 400;
        font-style: normal;
        letter-spacing: normal;
        animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes menuFadeIn {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .fluent-menu.open {
        display: flex;
      }

      .menu-row {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 5px;
        color: var(--text-color);
        font-size: 12.5px;
        font-family: var(--mnt-font);
        font-weight: 400;
        font-style: normal;
        letter-spacing: normal;
        cursor: pointer;
        text-decoration: none;
        background: transparent;
        border: none;
        text-align: left;
        box-sizing: border-box;
        width: 100%;
      }

      .menu-row:hover {
        background-color: var(--hover-bg);
      }

      .menu-row-left {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: var(--mnt-font);
      }

      .check-slot {
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .menu-divider {
        height: 1px;
        background-color: var(--divider);
        margin: 4px 6px;
      }

      .submenu {
        position: absolute;
        top: -4px;
        right: calc(100% + 4px);
        min-width: 215px;
        background-color: var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 8px;
        box-shadow: var(--menu-shadow);
        padding: 4px;
        display: none;
        flex-direction: column;
        font-family: var(--mnt-font);
      }

      .menu-row.has-submenu:hover > .submenu,
      .menu-row.has-submenu.open > .submenu {
        display: flex;
      }
    `;

    const wrapper = document.createElement("div");
    wrapper.className = "bar-wrapper";
    // Desativa transição no frame 0 para que a barra não anime se já nascer recolhida
    wrapper.style.transition = "none";

    // APLICAÇÃO IMEDIATA DO TEMA MEMORIZADO (Antes de inserir no DOM para evitar qualquer piscada)
    const memorized = getMemorizedTheme();
    if (memorized) {
      host.setAttribute("data-theme", memorized.theme);
      if (memorized.bgBar) {
        host.style.setProperty("--bg-bar", memorized.bgBar);
        wrapper.style.setProperty("--bg-bar", memorized.bgBar);
      }
    } else {
      // Na 1ª abertura sem cache, inicia seguindo a preferência do navegador até validar a página
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      host.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }

    const strip = document.createElement("div");
    strip.className = "bookmarks-strip";

    const moreBtn = document.createElement("button");
    moreBtn.className = "more-btn";
    moreBtn.title = "Mais opções da barra (My New Tab)";
    moreBtn.innerHTML = ICONS.more;

    const settingsMenu = document.createElement("div");
    settingsMenu.className = "fluent-menu";

    const contextMenu = document.createElement("div");
    contextMenu.className = "fluent-menu";

    const folderDropdown = document.createElement("div");
    folderDropdown.className = "fluent-menu";

    wrapper.appendChild(strip);
    wrapper.appendChild(moreBtn);

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    shadow.appendChild(settingsMenu);
    shadow.appendChild(contextMenu);
    shadow.appendChild(folderDropdown);

    ui = {
      host,
      shadow,
      pageStyle,
      wrapper,
      strip,
      moreBtn,
      settingsMenu,
      contextMenu,
      folderDropdown,
      isHoverRevealed: false,
      isMenuOpen: false,
      appliedTheme: memorized ? memorized.theme : null,
      appliedBgBar: memorized ? memorized.bgBar : null,
      cleanupFns: []
    };

    // Define estado visível/oculto antes de anexar ao DOM
    updateBarVisibilityState();

    const appendTarget = document.documentElement || document.body;
    appendTarget.appendChild(pageStyle);
    appendTarget.appendChild(host);

    // Restaura a transição suave após a montagem inicial
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ui && ui.wrapper) {
          ui.wrapper.style.transition = "";
        }
      });
    });

    renderBookmarksList();
    renderSettingsMenu();
    renderContextMenu();
    setupInteractions();
    setupThemeAndColorSync();
    injectSpeculationRules();
  }

  function renderBookmarksList() {
    if (!ui) return;
    ui.strip.innerHTML = "";

    currentBookmarks.forEach((node) => {
      if (node.url) {
        if (!isSafeUrl(node.url)) return;

        const link = document.createElement("a");
        link.className = "item";
        link.href = node.url;
        link.title = `${node.title || ""}\n${node.url}`;

        const icon = document.createElement("img");
        icon.src = getFaviconUrl(node.url);

        link.appendChild(icon);
        if (node.title) {
          const span = document.createElement("span");
          span.className = "title";
          span.textContent = node.title;
          link.appendChild(span);
        }
        ui.strip.appendChild(link);
      } else if (node.children) {
        const folderBtn = document.createElement("button");
        folderBtn.className = "item";
        folderBtn.title = node.title || "";
        folderBtn.innerHTML = ICONS.folder;

        const span = document.createElement("span");
        span.className = "title";
        span.textContent = node.title || "";
        folderBtn.appendChild(span);

        folderBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openFolderMenu(folderBtn, node.children);
        });

        ui.strip.appendChild(folderBtn);
      }
    });
  }

  function openFolderMenu(anchorBtn, children) {
    closeAllMenus();
    ui.folderDropdown.innerHTML = "";

    const validChildren = Array.isArray(children)
      ? children.filter((child) => child && isSafeUrl(child.url))
      : [];

    if (validChildren.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-row";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "(Pasta vazia)";
      ui.folderDropdown.appendChild(empty);
    } else {
      validChildren.forEach((child) => {
        const link = document.createElement("a");
        link.className = "menu-row";
        link.href = child.url;
        link.title = `${child.title || ""}\n${child.url}`;

        const left = document.createElement("div");
        left.className = "menu-row-left";

        const img = document.createElement("img");
        img.src = getFaviconUrl(child.url);
        img.style.width = "16px";
        img.style.height = "16px";

        const text = document.createElement("span");
        text.textContent = child.title || child.url;

        left.appendChild(img);
        left.appendChild(text);
        link.appendChild(left);
        ui.folderDropdown.appendChild(link);
      });
    }

    const rect = anchorBtn.getBoundingClientRect();
    ui.folderDropdown.style.top = "35px";
    ui.folderDropdown.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
    ui.folderDropdown.style.maxHeight = "420px";
    ui.folderDropdown.style.overflowY = "auto";
    ui.folderDropdown.classList.add("open");
    anchorBtn.classList.add("active");
    ui.isMenuOpen = true;
  }

  function renderSettingsMenu() {
    if (!ui) return;
    ui.settingsMenu.innerHTML = "";

    const searchEngineOptions = [
      { id: "google", label: "Google" },
      { id: "duckduckgo", label: "DuckDuckGo" },
      { id: "yahoo", label: "Yahoo Search" },
      { id: "brave", label: "Brave Search" }
    ];

    const aiEngineOptions = [
      { id: "gemini", label: "Gemini" },
      { id: "claude", label: "Claude" },
      { id: "chatgpt", label: "ChatGPT" },
      { id: "perplexity", label: "Perplexity" }
    ];

    const visibilityOptions = [
      { id: "home_only", label: "Mostrar somente no início" },
      { id: "always", label: "Sempre mostrar (neste buscador)" },
      { id: "never", label: "Nunca mostrar (apenas ao encostar no topo)" }
    ];

    const engineRow = document.createElement("div");
    engineRow.className = "menu-row has-submenu";
    engineRow.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot"></span>
        <span>Definir buscador padrão</span>
      </div>
      ${ICONS.chevronRight}
    `;

    const engineSubmenu = document.createElement("div");
    engineSubmenu.className = "submenu";

    const createEngineOptionBtn = (opt) => {
      const btn = document.createElement("button");
      btn.className = "menu-row";
      const isSelected = currentSettings.engine === opt.id;
      btn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${isSelected ? ICONS.check : ""}</span>
          <span>${opt.label}</span>
        </div>
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        saveSetting({ engine: opt.id }, () => {
          closeAllMenus();
          if (enginesMap[opt.id] && isSafeUrl(enginesMap[opt.id])) {
            window.location.href = enginesMap[opt.id];
          }
        });
      });
      return btn;
    };

    searchEngineOptions.forEach((opt) => {
      engineSubmenu.appendChild(createEngineOptionBtn(opt));
    });

    const engineGroupDivider = document.createElement("div");
    engineGroupDivider.className = "menu-divider";
    engineSubmenu.appendChild(engineGroupDivider);

    aiEngineOptions.forEach((opt) => {
      engineSubmenu.appendChild(createEngineOptionBtn(opt));
    });

    engineRow.appendChild(engineSubmenu);

    const visRow = document.createElement("div");
    visRow.className = "menu-row has-submenu";
    visRow.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot"></span>
        <span>Exibição da barra de favoritos</span>
      </div>
      ${ICONS.chevronRight}
    `;

    const visSubmenu = document.createElement("div");
    visSubmenu.className = "submenu";

    visibilityOptions.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "menu-row";
      const isSelected = currentSettings.barVisibility === opt.id;
      btn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${isSelected ? ICONS.check : ""}</span>
          <span>${opt.label}</span>
        </div>
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        saveSetting({ barVisibility: opt.id }, () => {
          renderSettingsMenu();
          renderContextMenu();
          updateBarVisibilityState();
          closeAllMenus();
        });
      });
      visSubmenu.appendChild(btn);
    });
    visRow.appendChild(visSubmenu);

    const divider1 = document.createElement("div");
    divider1.className = "menu-divider";

    const accelBtn = document.createElement("button");
    accelBtn.className = "menu-row";
    accelBtn.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot">${currentSettings.acceleration ? ICONS.check : ""}</span>
        <span>Aceleração da Home</span>
      </div>
    `;
    accelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSetting({ acceleration: !currentSettings.acceleration }, () => {
        injectSpeculationRules();
        renderSettingsMenu();
        closeAllMenus();
      });
    });

    const divider2 = document.createElement("div");
    divider2.className = "menu-divider";

    const favManagerBtn = document.createElement("button");
    favManagerBtn.className = "menu-row";
    favManagerBtn.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot">${ICONS.starEdit}</span>
        <span>Editar favoritos...</span>
      </div>
    `;
    favManagerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();
      chrome.runtime.sendMessage({ action: "openFavoritesManager" });
    });

    ui.settingsMenu.appendChild(engineRow);
    ui.settingsMenu.appendChild(visRow);
    ui.settingsMenu.appendChild(divider1);
    ui.settingsMenu.appendChild(accelBtn);
    ui.settingsMenu.appendChild(divider2);
    ui.settingsMenu.appendChild(favManagerBtn);
  }

  function renderContextMenu() {
    if (!ui) return;
    ui.contextMenu.innerHTML = "";

    const editFavBtn = document.createElement("button");
    editFavBtn.className = "menu-row";
    editFavBtn.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot">${ICONS.starEdit}</span>
        <span>Editar favoritos</span>
      </div>
    `;
    editFavBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllMenus();
      chrome.runtime.sendMessage({ action: "openFavoritesManager" });
    });

    const divider = document.createElement("div");
    divider.className = "menu-divider";

    ui.contextMenu.appendChild(editFavBtn);
    ui.contextMenu.appendChild(divider);

    const quickModes = [
      { id: "home_only", label: "Mostrar somente no início" },
      { id: "always", label: "Sempre mostrar" },
      { id: "never", label: "Nunca mostrar" }
    ];

    quickModes.forEach((m) => {
      const row = document.createElement("button");
      row.className = "menu-row";
      const checked = currentSettings.barVisibility === m.id;
      row.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${checked ? ICONS.check : ""}</span>
          <span>${m.label}</span>
        </div>
      `;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        saveSetting({ barVisibility: m.id }, () => {
          renderSettingsMenu();
          renderContextMenu();
          updateBarVisibilityState();
          closeAllMenus();
        });
      });
      ui.contextMenu.appendChild(row);
    });
  }

  function saveSetting(partial, callback) {
    currentSettings = { ...currentSettings, ...partial };
    chrome.runtime.sendMessage({ action: "updateSettings", newSettings: partial }, () => {
      if (callback) callback();
    });
  }

  function closeAllMenus() {
    if (!ui) return;
    ui.settingsMenu.classList.remove("open");
    ui.contextMenu.classList.remove("open");
    ui.folderDropdown.classList.remove("open");
    ui.moreBtn.classList.remove("active");
    ui.strip.querySelectorAll(".item.active").forEach((el) => el.classList.remove("active"));
    ui.isMenuOpen = false;
    updateBarVisibilityState();
  }

  function shouldBarBeDocked() {
    if (!currentSettings) return false;
    if (currentSettings.barVisibility === "always") return true;
    if (currentSettings.barVisibility === "never") return false;
    return isSearchHomePage();
  }

  function clearFixedTopAttributes() {
    document.querySelectorAll("[data-mnt-fixed-top], [data-mnt-fixed-full]").forEach((el) => {
      el.removeAttribute("data-mnt-fixed-top");
      el.removeAttribute("data-mnt-fixed-full");
      el.style.removeProperty("--mnt-orig-top");
    });
  }

  function adjustFixedTopElements() {
    if (!ui || !shouldBarBeDocked() || !document.body) return;

    const candidates = new Set();

    document.body
      .querySelectorAll(
        'header, nav, aside, [role="banner"], [role="navigation"], #gb, #searchform, .sfbg, #hd, #ybar, .header-wrap'
      )
      .forEach((el) => candidates.add(el));

    const sampleYs = [6, 18, 30];
    const w = window.innerWidth || 1024;
    const sampleXs = [
      16,
      48,
      120,
      Math.floor(w * 0.25),
      Math.floor(w * 0.5),
      Math.floor(w * 0.75),
      w - 120,
      w - 48,
      w - 16
    ];

    for (const y of sampleYs) {
      for (const x of sampleXs) {
        if (x <= 0) continue;
        const hits = document.elementsFromPoint(x, y);
        for (const hit of hits) {
          const chain = [];
          let curr = hit;
          while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr !== ui.host) chain.push(curr);
            curr = curr.parentElement;
          }
          for (let i = chain.length - 1; i >= 0; i--) {
            candidates.add(chain[i]);
          }
        }
      }
    }

    candidates.forEach((el) => {
      if (!el || el === ui.host || el.hasAttribute("data-mnt-fixed-top")) return;
      if (el.parentElement && el.parentElement.closest('[data-mnt-fixed-top="true"]')) return;

      const cs = window.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") return;

      const rect = el.getBoundingClientRect();
      const parsedTop = parseFloat(cs.top);
      const origTop = Number.isFinite(parsedTop) ? parsedTop : 0;

      const isFixedInBarZone = cs.position === "fixed" && rect.top >= -2 && rect.top < 34;
      const isStickyTopHeader = cs.position === "sticky" && origTop >= 0 && origTop < 34 && rect.top <= 48;

      if ((isFixedInBarZone || isStickyTopHeader) && origTop >= -2 && origTop < 34) {
        el.style.setProperty("--mnt-orig-top", `${Math.max(0, origTop)}px`);
        el.setAttribute("data-mnt-fixed-top", "true");

        if (cs.position === "fixed" && rect.height >= window.innerHeight - 10) {
          el.setAttribute("data-mnt-fixed-full", "true");
        }
      }
    });
  }

  function updateBarVisibilityState() {
    if (!ui) return;
    const docked = shouldBarBeDocked();

    if (docked) {
      ui.wrapper.classList.remove("hidden", "floating-open");
      ui.pageStyle.textContent = `
        html {
          padding-top: 34px !important;
          box-sizing: border-box !important;
        }
        body {
          position: relative !important;
          box-sizing: border-box !important;
        }
        .h-screen, .h-dvh, .h-svh,
        chat-app, bard-sidenav-container {
          height: calc(100dvh - 34px) !important;
          max-height: calc(100dvh - 34px) !important;
        }
        .min-h-screen, .min-h-dvh, .min-h-svh {
          min-height: calc(100dvh - 34px) !important;
        }
        #searchform, .sfbg, header[role="banner"], .header-wrap {
          margin-top: 0px;
        }
        #searchform.minidiv {
          top: 34px !important;
        }
        [data-mnt-fixed-top="true"] {
          top: calc(var(--mnt-orig-top, 0px) + 34px) !important;
        }
        [data-mnt-fixed-full="true"] {
          height: calc(100dvh - 34px) !important;
          max-height: calc(100dvh - 34px) !important;
        }
      `;
      adjustFixedTopElements();
      requestAnimationFrame(adjustFixedTopElements);
    } else {
      ui.pageStyle.textContent = "";
      clearFixedTopAttributes();
      if (ui.isHoverRevealed || ui.isMenuOpen) {
        ui.wrapper.classList.remove("hidden");
        ui.wrapper.classList.add("floating-open");
      } else {
        ui.wrapper.classList.add("hidden");
        ui.wrapper.classList.remove("floating-open");
      }
    }
  }

  function setupInteractions() {
    let hoverTimer = null;

    ui.moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = ui.settingsMenu.classList.contains("open");
      closeAllMenus();
      if (!wasOpen) {
        renderSettingsMenu();
        ui.settingsMenu.style.top = "35px";
        ui.settingsMenu.style.right = "8px";
        ui.settingsMenu.style.left = "auto";
        ui.settingsMenu.classList.add("open");
        ui.moreBtn.classList.add("active");
        ui.isMenuOpen = true;
        updateBarVisibilityState();
      }
    });

    ui.wrapper.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllMenus();
      renderContextMenu();
      ui.contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 180)}px`;
      ui.contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 250)}px`;
      ui.contextMenu.classList.add("open");
      ui.isMenuOpen = true;
      updateBarVisibilityState();
    });

    const onWindowMouseMove = (e) => {
      if (!ui || shouldBarBeDocked()) return;

      if (e.clientY <= 8) {
        if (!ui.isHoverRevealed) {
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            if (!ui) return;
            ui.isHoverRevealed = true;
            updateBarVisibilityState();
          }, 40);
        }
      } else if (ui.isHoverRevealed && e.clientY > 46 && !ui.isMenuOpen) {
        clearTimeout(hoverTimer);
        ui.isHoverRevealed = false;
        updateBarVisibilityState();
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove, { passive: true });

    ui.wrapper.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      ui.isHoverRevealed = true;
      updateBarVisibilityState();
    });

    ui.wrapper.addEventListener("mouseleave", (e) => {
      if (!ui.isMenuOpen && e.clientY > 34) {
        ui.isHoverRevealed = false;
        updateBarVisibilityState();
      }
    });

    const onDocumentClick = () => {
      if (ui && ui.isMenuOpen) closeAllMenus();
      if (ui && shouldBarBeDocked()) {
        setTimeout(adjustFixedTopElements, 60);
      }
    };
    document.addEventListener("click", onDocumentClick);

    let scrollRafId = null;
    const onLayoutShiftOrScroll = () => {
      if (!ui || !shouldBarBeDocked() || scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = null;
        adjustFixedTopElements();
      });
    };
    window.addEventListener("scroll", onLayoutShiftOrScroll, { passive: true });
    window.addEventListener("resize", onLayoutShiftOrScroll, { passive: true });
    document.addEventListener("DOMContentLoaded", adjustFixedTopElements, { once: true });
    window.addEventListener("load", adjustFixedTopElements, { once: true });

    let lastHref = window.location.href;
    const checkUrlChange = () => {
      if (!ui) return;
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        ui.isHoverRevealed = false;
        closeAllMenus();
        updateBarVisibilityState();
        injectSpeculationRules();
      }
    };

    window.addEventListener("popstate", checkUrlChange);
    const urlIntervalId = setInterval(checkUrlChange, 250);

    // Registra limpeza para evitar Memory Leaks caso a barra seja desmontada
    ui.cleanupFns.push(() => {
      clearTimeout(hoverTimer);
      clearInterval(urlIntervalId);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("popstate", checkUrlChange);
      window.removeEventListener("scroll", onLayoutShiftOrScroll);
      window.removeEventListener("resize", onLayoutShiftOrScroll);
      document.removeEventListener("DOMContentLoaded", adjustFixedTopElements);
      window.removeEventListener("load", adjustFixedTopElements);
      document.removeEventListener("click", onDocumentClick);
    });
  }

  // Extrai a cor de fundo real da página (verificando body, html e container raiz de SPAs) após o carregamento completo
  function extractPageColor() {
    const engine = detectCurrentEngine();
    const rootApp = document.body
      ? document.body.querySelector("chat-app, #__next, #root, #app, main") || document.body.firstElementChild
      : null;
    const candidates = [document.body, document.documentElement, rootApp].filter(Boolean);
    for (const el of candidates) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);

        // Evita falso positivo caso o <html> tenha fundo branco padrão enquanto a página usa color-scheme dark
        if (el === document.documentElement && r === 255 && g === 255 && b === 255) {
          const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
          if (
            String(style.colorScheme).includes("dark") ||
            (bodyStyle && String(bodyStyle.colorScheme).includes("dark"))
          ) {
            continue;
          }
        }

        // No Google e Gemini, o canvas nativo escuro pode reportar preto puro (#000000) antes do estilo aplicar
        if ((engine === "google" || engine === "gemini") && r === 0 && g === 0 && b === 0) {
          continue;
        }

        return { r, g, b };
      }
    }
    return null;
  }

  // Valida a cor real somente DEPOIS que a página termina de carregar por completo
  function setupThemeAndColorSync() {
    let debounceTimer = null;
    let postLoadTimer = null;
    let observer = null;

    function validateAndApplyTheme() {
      if (!ui) return;

      const rgb = extractPageColor();
      let detectedTheme;
      let detectedBgBar;

      if (rgb) {
        const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        detectedTheme = luminance < 0.5 ? "dark" : "light";
        const shift = detectedTheme === "dark" ? 8 : -6;
        const nr = Math.min(255, Math.max(0, rgb.r + shift));
        const ng = Math.min(255, Math.max(0, rgb.g + shift));
        const nb = Math.min(255, Math.max(0, rgb.b + shift));
        detectedBgBar = `rgba(${nr}, ${ng}, ${nb}, 0.90)`;
      } else {
        // Se a página ainda não pintou o fundo, não sobrescreve o tema que já está memorizado
        if (ui.appliedTheme) return;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        detectedTheme = prefersDark ? "dark" : "light";
        detectedBgBar = prefersDark
          ? "rgba(32, 33, 36, 0.90)"
          : "rgba(247, 247, 247, 0.88)";
      }

      // Se for idêntico ao que já foi carregado da memória, mantém intacto sem repintar
      if (ui.appliedTheme === detectedTheme && ui.appliedBgBar === detectedBgBar) {
        const engine = detectCurrentEngine();
        const cached = engine ? currentSettings?.themeCache?.[engine] : null;
        if (!cached || cached.theme !== detectedTheme || cached.bgBar !== detectedBgBar) {
          memorizeTheme({ theme: detectedTheme, bgBar: detectedBgBar });
        }
        return;
      }

      ui.appliedTheme = detectedTheme;
      ui.appliedBgBar = detectedBgBar;
      ui.host.setAttribute("data-theme", detectedTheme);
      ui.host.style.setProperty("--bg-bar", detectedBgBar);
      ui.wrapper.style.setProperty("--bg-bar", detectedBgBar);

      memorizeTheme({ theme: detectedTheme, bgBar: detectedBgBar });
    }

    function debouncedValidateTheme() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(validateAndApplyTheme, 100);
    }

    const startWatchingAfterLoad = () => {
      if (!ui) return;
      validateAndApplyTheme();
      adjustFixedTopElements();

      if (observer) observer.disconnect();
      const attrFilter = ["class", "style", "dark", "data-theme", "data-mode", "data-color-scheme"];
      observer = new MutationObserver(debouncedValidateTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: attrFilter
      });
      if (document.body) {
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: attrFilter
        });
      }
    };

    const onWindowLoaded = () => {
      clearTimeout(postLoadTimer);
      // Aguarda 150ms após o load completo para garantir que o CSS noturno do buscador já estabilizou
      postLoadTimer = setTimeout(startWatchingAfterLoad, 150);
    };

    if (document.readyState === "complete") {
      onWindowLoaded();
    } else {
      window.addEventListener("load", onWindowLoaded, { once: true });
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", debouncedValidateTheme);

    ui.cleanupFns.push(() => {
      clearTimeout(debounceTimer);
      clearTimeout(postLoadTimer);
      if (observer) observer.disconnect();
      window.removeEventListener("load", onWindowLoaded);
      mediaQuery.removeEventListener("change", debouncedValidateTheme);
    });
  }

  // CAMADA 3 DE ACELERAÇÃO: Speculation Rules API (ativa ao sair da Home para manter a volta instantânea)
  function injectSpeculationRules() {
    const existing = document.getElementById("mnt-speculation-rules");
    if (!currentSettings?.acceleration || isSearchHomePage()) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const appendRules = () => {
      if (!currentSettings?.acceleration || isSearchHomePage()) return;
      if (!document.head || document.getElementById("mnt-speculation-rules")) return;
      const specScript = document.createElement("script");
      specScript.id = "mnt-speculation-rules";
      specScript.type = "speculationrules";
      specScript.textContent = JSON.stringify({
        prerender: [
          {
            source: "list",
            urls: [window.location.origin + "/"]
          }
        ]
      });
      document.head.appendChild(specScript);
    };

    if (document.head) {
      appendRules();
    } else {
      document.addEventListener("DOMContentLoaded", appendRules, { once: true });
    }
  }
})();