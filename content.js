(function () {
  if (window.top !== window.self) return;

  let currentSettings = null;
  let currentBookmarks = [];
  let enginesMap = {};
  let ui = null;

  // Identifica em qual buscador o usuário está no momento
  function detectCurrentEngine() {
    const host = window.location.hostname;
    if (host.includes("google.")) return "google";
    if (host.includes("duckduckgo.")) return "duckduckgo";
    if (host.includes("yahoo.")) return "yahoo";
    if (host.includes("brave.")) return "brave";
    return null;
  }

  // Verifica se o usuário está na tela inicial de pesquisa (Home) ou na página de resultados
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
    return false;
  }

  function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "16");
    return url.toString();
  }

  // Ícones SVG Fluent Design
  const ICONS = {
    folder: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 3.5C1.5 2.67157 2.17157 2 3 2H6.17157C6.70201 2 7.21071 2.21071 7.58579 2.58579L8.41421 3.41421C8.78929 3.78929 9.29799 4 9.82843 4H13C13.8284 4 14.5 4.67157 14.5 5.5V12.5C14.5 13.3284 13.8284 14 13 14H3C2.17157 14 1.5 13.3284 1.5 12.5V3.5Z" fill="#F5B942" stroke="#D99B26" stroke-width="0.8"/></svg>`,
    more: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.5" cy="8" r="1.25"/></svg>`,
    chevronRight: `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4.5 2.25L8.25 6L4.5 9.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    starEdit: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.85 5.25L14 5.85L11 8.77L11.7 12.9L8 10.95L4.3 12.9L5 8.77L2 5.85L6.15 5.25L8 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`
  };

  // Inicializa os dados e monta a barra se estivermos no buscador padrão escolhido
  chrome.runtime.sendMessage({ action: "initData" }, (response) => {
    if (!response) return;
    currentSettings = response.settings;
    currentBookmarks = response.items || [];
    enginesMap = response.engines || {};

    evaluateActivation();
  });

  // Escuta atualizações em tempo real dos favoritos
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "bookmarksUpdated" && ui) {
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
    }
    updateBarVisibilityState();
  }

  function destroyBar() {
    if (ui) {
      ui.host.remove();
      ui.pageStyle.remove();
      ui = null;
    }
  }

  function mountBar() {
    const host = document.createElement("div");
    host.id = "mnt-edge-bookmarks-host";
    const shadow = host.attachShadow({ mode: "open" });

    // Estilo que desloca a página suavemente quando a barra está fixa
    const pageStyle = document.createElement("style");
    pageStyle.id = "mnt-edge-page-offset";

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 34px;
        z-index: 2147483647;
        font-family: 'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px;
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
        transform: translateY(0);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, background-color 0.2s ease;
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
        font-family: inherit;
        font-size: 12px;
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
      }

      .more-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 24px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--text-color);
        cursor: pointer;
        flex-shrink: 0;
        transition: background-color 0.1s ease;
      }

      .more-btn:hover, .more-btn.active {
        background-color: var(--hover-bg);
      }

      /* Menus no estilo Fluent UI do Edge */
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
        cursor: pointer;
        text-decoration: none;
        background: transparent;
        border: none;
        font-family: inherit;
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

      /* Submenu lateral que abre ao passar o mouse ou clicar */
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
      }

      .menu-row.has-submenu:hover > .submenu,
      .menu-row.has-submenu.open > .submenu {
        display: flex;
      }
    `;

    const wrapper = document.createElement("div");
    wrapper.className = "bar-wrapper";

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
      isMenuOpen: false
    };

    const appendTarget = document.documentElement || document.body;
    appendTarget.appendChild(pageStyle);
    appendTarget.appendChild(host);

    renderBookmarksList();
    renderSettingsMenu();
    renderContextMenu();
    setupInteractions();
    setupThemeAndColorSync();
    injectSpeculationRules();
  }

  // Renderiza os favoritos e pastas na barra
  function renderBookmarksList() {
    if (!ui) return;
    ui.strip.innerHTML = "";

    currentBookmarks.forEach((node) => {
      if (node.url) {
        const link = document.createElement("a");
        link.className = "item";
        link.href = node.url;
        link.title = `${node.title}\n${node.url}`;

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
        folderBtn.title = node.title;
        folderBtn.innerHTML = `${ICONS.folder}<span class="title">${node.title}</span>`;

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

    if (!children || children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "menu-row";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "(Pasta vazia)";
      ui.folderDropdown.appendChild(empty);
    } else {
      children.forEach((child) => {
        if (!child.url) return;
        const link = document.createElement("a");
        link.className = "menu-row";
        link.href = child.url;
        link.title = `${child.title}\n${child.url}`;

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

  // Constrói o menu "..." com submenus no padrão do Edge
  function renderSettingsMenu() {
    if (!ui) return;
    ui.settingsMenu.innerHTML = "";

    const engineOptions = [
      { id: "google", label: "Google" },
      { id: "duckduckgo", label: "DuckDuckGo" },
      { id: "yahoo", label: "Yahoo Search" },
      { id: "brave", label: "Brave Search" }
    ];

    const visibilityOptions = [
      { id: "home_only", label: "Mostrar somente no início" },
      { id: "always", label: "Sempre mostrar (neste buscador)" },
      { id: "never", label: "Nunca mostrar (apenas ao encostar no topo)" }
    ];

    // 1. Submenu: Definir buscador padrão
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

    engineOptions.forEach((opt) => {
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
          if (enginesMap[opt.id]) {
            window.location.href = enginesMap[opt.id];
          }
        });
      });
      engineSubmenu.appendChild(btn);
    });
    engineRow.appendChild(engineSubmenu);

    // 2. Submenu: Exibição da barra de favoritos
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

    // Divisor
    const divider1 = document.createElement("div");
    divider1.className = "menu-divider";

    // 3. Opção: Aceleração da Home
    const accelBtn = document.createElement("button");
    accelBtn.className = "menu-row";
    accelBtn.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot">${currentSettings.acceleration ? ICONS.check : ""}</span>
        <span>Aceleração da Home (Instant Load)</span>
      </div>
    `;
    accelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSetting({ acceleration: !currentSettings.acceleration }, () => {
        renderSettingsMenu();
        closeAllMenus();
      });
    });

    // Divisor
    const divider2 = document.createElement("div");
    divider2.className = "menu-divider";

    // 4. Atalho para Editar Favoritos (edge://favorites/)
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

  // Menu de Contexto ao clicar com o botão direito na barra
  function renderContextMenu() {
    if (!ui) return;
    ui.contextMenu.innerHTML = "";

    const editFavBtn = document.createElement("button");
    editFavBtn.className = "menu-row";
    editFavBtn.innerHTML = `
      <div class="menu-row-left">
        <span class="check-slot">${ICONS.starEdit}</span>
        <span>Editar favoritos (edge://favorites)</span>
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

  // Decide se a barra deve ficar acoplada (empurrando a página) ou recolhida (revelando no hover)
  function shouldBarBeDocked() {
    if (!currentSettings) return false;
    if (currentSettings.barVisibility === "always") return true;
    if (currentSettings.barVisibility === "never") return false;
    // Padrão "home_only": acoplada na Home, oculta após pesquisar
    return isSearchHomePage();
  }

  function updateBarVisibilityState() {
    if (!ui) return;
    const docked = shouldBarBeDocked();

    if (docked) {
      ui.wrapper.classList.remove("hidden", "floating-open");
      // Empurra tanto a página normal quanto cabeçalhos fixos de resultados de pesquisa
      ui.pageStyle.textContent = `
        html {
          padding-top: 34px !important;
          box-sizing: border-box;
        }
        /* Ajuste para cabeçalhos fixos em páginas de resultados de busca */
        #searchform, .sfbg, header[role="banner"], .header-wrap {
          margin-top: 0px;
        }
      `;
    } else {
      ui.pageStyle.textContent = "";
      if (ui.isHoverRevealed || ui.isMenuOpen) {
        ui.wrapper.classList.remove("hidden");
        ui.wrapper.classList.add("floating-open");
      } else {
        ui.wrapper.classList.add("hidden");
        ui.wrapper.classList.remove("floating-open");
      }
    }
  }

  // Configura eventos de clique, botão direito e aproximação do mouse na borda superior
  function setupInteractions() {
    let hoverTimer = null;

    // Botão "..." no canto direito da barra
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

    // Clique com o botão direito na barra abre o menu de contexto com "Editar favoritos"
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

    // Detecta quando o mouse encosta na borda superior da tela (<= 8px)
    window.addEventListener(
      "mousemove",
      (e) => {
        if (!ui || shouldBarBeDocked()) return;

        if (e.clientY <= 8) {
          if (!ui.isHoverRevealed) {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
              ui.isHoverRevealed = true;
              updateBarVisibilityState();
            }, 40);
          }
        } else if (ui.isHoverRevealed && e.clientY > 46 && !ui.isMenuOpen) {
          clearTimeout(hoverTimer);
          ui.isHoverRevealed = false;
          updateBarVisibilityState();
        }
      },
      { passive: true }
    );

    // Mantém a barra aberta enquanto o mouse estiver sobre ela
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

    document.addEventListener("click", () => {
      if (ui && ui.isMenuOpen) closeAllMenus();
    });

    // Monitora mudanças dinâmicas de URL (quando o usuário pesquisa sem recarregar tudo)
    let lastHref = window.location.href;
    const checkUrlChange = () => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        ui.isHoverRevealed = false;
        closeAllMenus();
        updateBarVisibilityState();
      }
    };
    window.addEventListener("popstate", checkUrlChange);
    setInterval(checkUrlChange, 250);
  }

  // Sincroniza a cor da barra com o fundo real da página e o modo Claro/Escuro do Edge
  function setupThemeAndColorSync() {
    function applyAdaptiveColor() {
      if (!ui) return;
      const bodyOrHtml = document.body || document.documentElement;
      const computedBg = window.getComputedStyle(bodyOrHtml).backgroundColor;
      const match = computedBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

      let isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        // Só considera se não for totalmente transparente
        if (!(r === 0 && g === 0 && b === 0 && computedBg.includes("0)"))) {
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          isDark = luminance < 0.5;
          // Ajusta sutilmente a cor da página para criar o efeito integrado do Edge
          const shift = isDark ? 8 : -6;
          const nr = Math.min(255, Math.max(0, r + shift));
          const ng = Math.min(255, Math.max(0, g + shift));
          const nb = Math.min(255, Math.max(0, b + shift));
          ui.host.style.setProperty("--bg-bar", `rgba(${nr}, ${ng}, ${nb}, 0.90)`);
        }
      }

      ui.host.setAttribute("data-theme", isDark ? "dark" : "light");
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyAdaptiveColor);
    } else {
      applyAdaptiveColor();
    }

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAdaptiveColor);

    const observer = new MutationObserver(applyAdaptiveColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "dark", "data-theme"]
    });
  }

  // CAMADA 3 DE ACELERAÇÃO: Speculation Rules API para pré-carregar a Home na memória do Chromium
  function injectSpeculationRules() {
    if (!currentSettings?.acceleration || !document.head) return;
    if (document.getElementById("mnt-speculation-rules")) return;

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
  }
})();