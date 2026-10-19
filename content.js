(function () {
  if (document.getElementById("edge-fluent-bookmarks-host")) return;

  // Função para buscar o favicon diretamente do cache interno do Edge
  function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "16");
    return url.toString();
  }

  // Ícone SVG padrão de pasta no estilo Fluent UI do Edge
  const folderSvg = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 3.5C1.5 2.67157 2.17157 2 3 2H6.17157C6.70201 2 7.21071 2.21071 7.58579 2.58579L8.41421 3.41421C8.78929 3.78929 9.29799 4 9.82843 4H13C13.8284 4 14.5 4.67157 14.5 5.5V12.5C14.5 13.3284 13.8284 14 13 14H3C2.17157 14 1.5 13.3284 1.5 12.5V3.5Z" fill="#F5B942" stroke="#D99B26" stroke-width="0.8"/>
    </svg>
  `;

  chrome.runtime.sendMessage({ action: "getBookmarks" }, (response) => {
    if (!response || !response.items) return;

    // Cria o container isolado com Shadow DOM
    const host = document.createElement("div");
    host.id = "edge-fluent-bookmarks-host";
    const shadow = host.attachShadow({ mode: "open" });

    // Empurra a página do Google 34px para baixo sem quebrar o layout
    const pageOffsetStyle = document.createElement("style");
    pageOffsetStyle.textContent = `
      html {
        padding-top: 34px !important;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(pageOffsetStyle);

    // Estilos Fluent Design (Modo Claro e Escuro automáticos)
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
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
        font-size: 12px;
        user-select: none;
        --bg-bar: #f7f7f7;
        --border-bar: #e5e5e5;
        --text-color: #1b1b1b;
        --hover-bg: rgba(0, 0, 0, 0.06);
        --active-bg: rgba(0, 0, 0, 0.1);
        --menu-bg: #ffffff;
        --menu-border: #d1d1d1;
        --menu-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --bg-bar: #202020;
          --border-bar: #353535;
          --text-color: #f3f3f3;
          --hover-bg: rgba(255, 255, 255, 0.08);
          --active-bg: rgba(255, 255, 255, 0.12);
          --menu-bg: #2c2c2c;
          --menu-border: #454545;
          --menu-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        }
      }

      .bar {
        display: flex;
        align-items: center;
        height: 33px;
        padding: 0 8px;
        gap: 2px;
        background-color: var(--bg-bar);
        border-bottom: 1px solid var(--border-bar);
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
      }

      .bar::-webkit-scrollbar {
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
        max-width: 150px;
        cursor: pointer;
        transition: background-color 0.1s ease;
        flex-shrink: 0;
        border: none;
        background: transparent;
        font-family: inherit;
        font-size: inherit;
      }

      .item:hover {
        background-color: var(--hover-bg);
      }

      .item:active {
        background-color: var(--active-bg);
      }

      .item img, .item svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .title {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dropdown {
        position: fixed;
        top: 32px;
        min-width: 180px;
        max-width: 280px;
        max-height: 400px;
        overflow-y: auto;
        background-color: var(--menu-bg);
        border: 1px solid var(--menu-border);
        border-radius: 6px;
        box-shadow: var(--menu-shadow);
        padding: 4px;
        display: none;
        flex-direction: column;
        z-index: 2147483647;
      }

      .dropdown.open {
        display: flex;
      }

      .dropdown .item {
        max-width: 100%;
        height: 28px;
        padding: 0 10px;
      }
    `;

    const bar = document.createElement("div");
    bar.className = "bar";

    let activeDropdown = null;

    function closeDropdowns() {
      if (activeDropdown) {
        activeDropdown.classList.remove("open");
        activeDropdown = null;
      }
    }

    // Cria um link de favorito ou pasta
    response.items.forEach((node) => {
      if (node.url) {
        // Favorito comum (usa tag <a> para suportar clique com scroll / botão direito)
        const link = document.createElement("a");
        link.className = "item";
        link.href = node.url;
        link.title = `${node.title}\n${node.url}`;

        const icon = document.createElement("img");
        icon.src = getFaviconUrl(node.url);

        const span = document.createElement("span");
        span.className = "title";
        span.textContent = node.title || node.url;

        link.appendChild(icon);
        if (node.title) link.appendChild(span);
        bar.appendChild(link);
      } else if (node.children) {
        // Pasta de favoritos com menu suspenso
        const folderBtn = document.createElement("button");
        folderBtn.className = "item";
        folderBtn.title = node.title;
        folderBtn.innerHTML = `${folderSvg}<span class="title">${node.title}</span>`;

        const dropdown = document.createElement("div");
        dropdown.className = "dropdown";

        node.children.forEach((child) => {
          if (!child.url) return;
          const subLink = document.createElement("a");
          subLink.className = "item";
          subLink.href = child.url;
          subLink.title = `${child.title}\n${child.url}`;

          const subIcon = document.createElement("img");
          subIcon.src = getFaviconUrl(child.url);

          const subSpan = document.createElement("span");
          subSpan.className = "title";
          subSpan.textContent = child.title || child.url;

          subLink.appendChild(subIcon);
          subLink.appendChild(subSpan);
          dropdown.appendChild(subLink);
        });

        folderBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isAlreadyOpen = activeDropdown === dropdown;
          closeDropdowns();
          if (!isAlreadyOpen) {
            const rect = folderBtn.getBoundingClientRect();
            dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
            dropdown.classList.add("open");
            activeDropdown = dropdown;
          }
        });

        bar.appendChild(folderBtn);
        shadow.appendChild(dropdown);
      }
    });

    document.addEventListener("click", closeDropdowns);

    shadow.appendChild(style);
    shadow.appendChild(bar);
    document.documentElement.appendChild(host);
  });
})();