(function () {
  "use strict";

  if (window.top !== window.self) return;

  const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
  const ITEMS_PER_PAGE = 7;

  // Paleta vibrante padrão inspirada no design Fluent / Edge
  const COLLECTION_COLORS = [
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

  // Emojis universais nativos do sistema operacional (zero assets externos)
  const COLLECTION_EMOJIS = [
    "💻", "📁", "📊", "📧", "📅", "📌", "💼", "🖥️",
    "🎨", "🎬", "🎵", "📸", "✨", "🖌️", "🎧", "🎯",
    "💡", "🚀", "📚", "📝", "🎓", "🧠", "📖", "🔍",
    "🛒", "💳", "💰", "📦", "📈", "🏷️", "💎", "🛠️",
    "🎮", "🍿", "✈️", "🏠", "☕", "🍕", "⚽", "🌿",
    "⭐", "❤️", "🔥", "⚡", "✅", "🔔", "🏆", "🌐",
    "🔒", "⚙️", "🧪", "📰", "🗂️", "💬", "🤝", "😂"
  ];

  const COL_ICONS = {
    plus: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    minus: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    dots: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.5" cy="8" r="1.25"/></svg>`,
    collections: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.25"/><rect x="9" y="2.5" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.25"/><rect x="2" y="9" width="5" height="4.5" rx="1.3" stroke="currentColor" stroke-width="1.25"/><rect x="9" y="9" width="5" height="4.5" rx="1.3" stroke="currentColor" stroke-width="1.25"/></svg>`,
    addCollection: `<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2.2" stroke="currentColor" stroke-width="1.25"/><path d="M8 5.6V10.4M5.6 8H10.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    edit: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.6 12.2l-3 .7.7-3 8-7.6Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>`,
    rename: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M8 4v8M5.5 12h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    hide: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6a2 2 0 0 0 2.8 2.8M3.6 5.3C2.5 6.2 1.8 7.5 1.5 8c.8 1.6 3.1 4.2 6.5 4.2 1.2 0 2.3-.3 3.2-.8M6.2 3.9c.6-.1 1.2-.2 1.8-.2 3.4 0 5.7 2.6 6.5 4.3-.3.6-.9 1.6-1.8 2.4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>`,
    chevronLeft: `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5L4 6L7.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevronRight: `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  function isValidHexColor(color) {
    return typeof color === "string" && HEX_COLOR_REGEX.test(color);
  }

  function hexToRgb(hex) {
    if (!isValidHexColor(hex)) return { r: 59, g: 158, b: 255 };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  // Calcula automaticamente a cor da fonte (branca ou escura) para contraste ótimo sobre a cor da coleção
  function getContrastingTextColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const perceivedBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
    return perceivedBrightness > 165 ? "#1b1b1b" : "#ffffff";
  }

  function pickRandomColor() {
    const idx = Math.floor(Math.random() * COLLECTION_COLORS.length);
    return COLLECTION_COLORS[idx];
  }

  function pickRandomEmoji() {
    const idx = Math.floor(Math.random() * COLLECTION_EMOJIS.length);
    return COLLECTION_EMOJIS[idx];
  }

  function generateCollectionId() {
    const bytes = new Uint8Array(6);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const randHex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `col_${Date.now().toString(36)}_${randHex}`;
  }

  // Ordena os favoritos da barra conforme a ordem personalizada salva no My New Tab
  function sortBarBookmarks(bookmarks, orderIds) {
    if (!Array.isArray(bookmarks) || bookmarks.length <= 1) return bookmarks || [];
    if (!Array.isArray(orderIds) || orderIds.length === 0) return bookmarks;

    const posMap = new Map();
    for (let i = 0; i < orderIds.length; i++) {
      posMap.set(String(orderIds[i]), i);
    }

    return bookmarks.slice().sort((a, b) => {
      const idA = String(a?.id || "");
      const idB = String(b?.id || "");
      const hasA = posMap.has(idA);
      const hasB = posMap.has(idB);
      if (hasA && hasB) return posMap.get(idA) - posMap.get(idB);
      if (hasA) return -1;
      if (hasB) return 1;
      return 0;
    });
  }

  function getStyles() {
    return `
      .collection-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 10px;
        border-radius: 7px;
        border: none;
        font-family: var(--mnt-font);
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        max-width: 175px;
        cursor: pointer;
        flex-shrink: 0;
        box-sizing: border-box;
        transition: opacity 0.18s ease, filter 0.14s ease, transform 0.12s ease;
      }

      .collection-pill:hover {
        filter: brightness(0.95);
      }

      .collection-pill:active {
        transform: scale(0.985);
      }

      .collection-pill.dimmed {
        opacity: 0.42;
      }

      .collection-pill.dimmed:hover {
        opacity: 0.72;
      }

      .collection-pill.drag-source,
      .item.drag-source,
      .col-fav-row.drag-source,
      .col-view-row.drag-source {
        opacity: 0.30 !important;
      }

      .collection-pill-emoji {
        font-size: 13px;
        line-height: 1;
        flex-shrink: 0;
        font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
      }

      .collection-pill-name {
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.15;
      }

      .collection-pill-inline-input {
        width: 105px;
        border: none;
        outline: none;
        background: rgba(255, 255, 255, 0.18);
        border-radius: 4px;
        padding: 1px 4px;
        font-family: var(--mnt-font);
        font-size: 12px;
        font-weight: 500;
        color: inherit;
        line-height: 1.15;
      }

      .collections-bar-gap {
        width: 4px;
        height: 14px;
        flex-shrink: 0;
      }

      .collection-create-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 24px;
        padding: 0 9px 0 6px;
        border-radius: 7px;
        border: 1px solid var(--menu-border);
        background-color: var(--capsule-bg);
        color: var(--text-color);
        flex-shrink: 0;
        box-sizing: border-box;
      }

      .create-emoji-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 18px;
        padding: 0 2px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-color);
        font-family: 'Segoe UI Emoji', 'Apple Color Emoji', var(--mnt-font);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        line-height: 1;
        transition: background-color 0.12s ease;
      }

      .create-emoji-trigger:hover {
        background-color: var(--hover-bg);
      }

      .create-name-input {
        width: 118px;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text-color);
        font-family: var(--mnt-font);
        font-size: 12px;
        font-weight: 400;
        padding: 0;
        margin: 0;
        line-height: 1.2;
      }

      .create-name-input::placeholder {
        color: var(--text-muted);
        opacity: 0.68;
      }

      .col-style-controls {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        pointer-events: auto;
      }

      .col-floating-style-bar {
        position: fixed;
        top: 38px;
        z-index: 2147483647;
        display: none;
        pointer-events: auto;
        animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .col-floating-style-bar.open {
        display: inline-flex;
      }

      .col-color-swatch {
        position: relative;
        width: 28px;
        height: 28px;
        border-radius: 7px;
        border: 1px solid var(--menu-border);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        cursor: pointer;
        flex-shrink: 0;
        box-sizing: border-box;
        transition: transform 0.12s ease;
      }

      .col-color-swatch:hover {
        transform: scale(1.04);
      }

      .col-color-swatch input[type="color"] {
        position: absolute;
        top: -6px;
        left: -6px;
        width: 40px;
        height: 40px;
        opacity: 0;
        cursor: pointer;
        border: none;
        padding: 0;
      }

      .col-emoji-swatch-wrap {
        position: relative;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
      }

      .col-emoji-swatch {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        border: 1px solid var(--menu-border);
        background-color: var(--capsule-bg);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        box-sizing: border-box;
        font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
        transition: transform 0.12s ease, background-color 0.12s ease;
      }

      .col-emoji-swatch:hover {
        transform: scale(1.04);
      }

      .col-emoji-clear {
        position: absolute;
        right: -4px;
        bottom: -4px;
        width: 13px;
        height: 13px;
        border-radius: 999px;
        border: none;
        background-color: #ff7b7b;
        color: #ffffff;
        font-family: var(--mnt-font);
        font-size: 8.5px;
        font-weight: 700;
        line-height: 1;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
        transition: background-color 0.12s ease, transform 0.12s ease;
      }

      .col-emoji-clear:hover {
        background-color: #ef4444;
        transform: scale(1.1);
      }

      .col-emoji-popover {
        position: fixed;
        width: 224px;
        background-color: var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 11px;
        box-shadow: var(--menu-shadow);
        padding: 7px;
        display: none;
        flex-direction: column;
        gap: 6px;
        z-index: 2147483647;
        pointer-events: auto;
        animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .col-emoji-popover.open {
        display: flex;
      }

      .col-emoji-custom-row {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .col-emoji-custom-input {
        flex: 1;
        height: 26px;
        border-radius: 6px;
        border: 1px solid var(--menu-border);
        background-color: var(--capsule-bg);
        color: var(--text-color);
        font-family: 'Segoe UI Emoji', 'Apple Color Emoji', var(--mnt-font);
        font-size: 11.5px;
        padding: 0 8px;
        outline: none;
        box-sizing: border-box;
      }

      .col-emoji-custom-input::placeholder {
        color: var(--text-muted);
        opacity: 0.72;
      }

      .col-emoji-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 2px;
        max-height: 152px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .col-emoji-cell {
        height: 25px;
        border: none;
        border-radius: 5px;
        background: transparent;
        font-size: 15px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
        transition: background-color 0.1s ease, transform 0.1s ease;
      }

      .col-emoji-cell:hover {
        background-color: var(--hover-bg);
        transform: scale(1.12);
      }

      .col-view-card {
        position: fixed;
        top: 38px;
        min-width: 220px;
        max-width: 280px;
        min-height: 52px;
        max-height: min(420px, calc(100vh - 50px));
        overflow-y: auto;
        scrollbar-width: thin;
        background: radial-gradient(
          circle at var(--col-grad-x, 28px) 0px,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.19) 0%,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.06) 46%,
          transparent 75%
        ), var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 13px;
        box-shadow: var(--menu-shadow);
        padding: 6px;
        display: none;
        flex-direction: column;
        gap: 1px;
        z-index: 2147483647;
        pointer-events: auto;
        box-sizing: border-box;
        animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
      }

      :host([data-theme="dark"]) .col-view-card {
        background: radial-gradient(
          circle at var(--col-grad-x, 28px) 0px,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.27) 0%,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.08) 46%,
          transparent 75%
        ), var(--menu-bg);
      }

      .col-view-card.open {
        display: flex;
      }

      .col-view-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 7px;
        color: var(--text-color);
        font-family: var(--mnt-font);
        font-size: 12.5px;
        text-decoration: none;
        cursor: pointer;
        box-sizing: border-box;
        transition: background-color 0.1s ease;
      }

      .col-view-row:hover {
        background-color: var(--hover-bg);
      }

      .col-view-row img {
        width: 16px;
        height: 16px;
        border-radius: 2px;
        flex-shrink: 0;
        pointer-events: none;
      }

      .col-view-row span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .col-view-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 14px 10px;
        color: var(--text-muted);
        font-size: 12px;
        text-align: center;
      }

      .col-view-add-btn {
        border: 1px solid var(--menu-border);
        background-color: var(--capsule-bg);
        color: var(--text-color);
        font-family: var(--mnt-font);
        font-size: 11.5px;
        padding: 4px 10px;
        border-radius: 999px;
        cursor: pointer;
        transition: background-color 0.12s ease;
      }

      .col-view-add-btn:hover {
        background-color: var(--hover-bg);
      }

      .col-editor-panel {
        position: fixed;
        top: 38px;
        width: 292px;
        display: none;
        flex-direction: column;
        gap: 7px;
        z-index: 2147483647;
        pointer-events: auto;
        box-sizing: border-box;
        animation: menuFadeIn 0.14s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .col-editor-panel.open {
        display: flex;
      }

      .col-dropzone-box {
        position: relative;
        min-height: 42px;
        max-height: min(160px, 24vh);
        overflow-y: auto;
        scrollbar-width: thin;
        background: radial-gradient(
          circle at var(--col-grad-x, 34px) 0px,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.21) 0%,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.06) 52%,
          transparent 78%
        ), var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 15px;
        box-shadow: var(--menu-shadow);
        padding: 5px 6px;
        display: flex;
        flex-direction: column;
        gap: 1px;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      :host([data-theme="dark"]) .col-dropzone-box {
        background: radial-gradient(
          circle at var(--col-grad-x, 34px) 0px,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.28) 0%,
          rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.08) 52%,
          transparent 78%
        ), var(--menu-bg);
      }

      .col-dropzone-box.drag-over {
        border-color: rgba(var(--col-r, 59), var(--col-g, 158), var(--col-b, 255), 0.75);
      }

      .col-dropzone-empty {
        min-height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 12px;
        opacity: 0.72;
        pointer-events: none;
      }

      .col-picker-box {
        background-color: var(--menu-bg);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--menu-border);
        border-radius: 15px;
        box-shadow: var(--menu-shadow);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      .col-picker-box.drag-remove-over {
        border-color: rgba(239, 68, 68, 0.55);
      }

      .col-search-input {
        width: 100%;
        height: 30px;
        border-radius: 999px;
        border: 1px solid var(--menu-border);
        background-color: var(--capsule-bg);
        color: var(--text-color);
        font-family: var(--mnt-font);
        font-size: 12px;
        padding: 0 12px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      .col-search-input::placeholder {
        color: var(--text-muted);
        opacity: 0.68;
      }

      .col-search-input:focus {
        border-color: rgba(59, 158, 255, 0.65);
      }

      .col-picker-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-height: 196px;
        max-height: min(210px, 34vh);
        overflow: hidden;
      }

      .col-picker-empty {
        flex: 1;
        min-height: 150px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        font-size: 12px;
        opacity: 0.75;
        text-align: center;
        padding: 0 12px;
      }

      .col-fav-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        height: 27px;
        padding: 0 4px 0 8px;
        border-radius: 6px;
        color: var(--text-color);
        font-size: 12px;
        cursor: grab;
        box-sizing: border-box;
        transition: background-color 0.1s ease;
      }

      .col-fav-row:hover {
        background-color: var(--hover-bg);
      }

      .col-fav-row:active {
        cursor: grabbing;
      }

      .col-fav-row-left {
        display: flex;
        align-items: center;
        gap: 7px;
        overflow: hidden;
        min-width: 0;
        flex: 1;
      }

      .col-fav-row-left img {
        width: 15px;
        height: 15px;
        border-radius: 2px;
        flex-shrink: 0;
        pointer-events: none;
      }

      .col-fav-row-left span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .col-fav-action-btn {
        width: 21px;
        height: 21px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
        opacity: 0.72;
        transition: background-color 0.1s ease, color 0.1s ease, opacity 0.1s ease;
      }

      .col-fav-row:hover .col-fav-action-btn,
      .col-fav-action-btn:hover {
        opacity: 1;
      }

      .col-fav-action-btn:hover {
        background-color: var(--active-bg);
        color: var(--text-color);
      }

      .col-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 18px;
        padding-top: 2px;
      }

      .col-page-nav {
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        opacity: 0.75;
        transition: opacity 0.12s ease, background-color 0.12s ease;
      }

      .col-page-nav:hover:not(:disabled) {
        opacity: 1;
        background-color: var(--hover-bg);
      }

      .col-page-nav:disabled {
        opacity: 0.22;
        cursor: default;
      }

      .col-page-dots {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .col-page-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        border: none;
        padding: 0;
        background-color: var(--text-muted);
        opacity: 0.28;
        cursor: pointer;
        transition: opacity 0.14s ease, transform 0.14s ease, background-color 0.14s ease;
      }

      .col-page-dot.active {
        background-color: var(--text-color);
        opacity: 0.92;
        transform: scale(1.12);
      }

      /* Submenu e Menu de Coleções */
      .submenu.collections-submenu {
        min-width: 278px;
        max-width: 300px;
      }

      .col-standalone-menu {
        min-width: 278px;
        max-width: 300px;
      }

      .col-menu-desc {
        font-size: 11.5px;
        line-height: 1.42;
        color: var(--text-muted);
        padding: 6px 10px 6px;
        white-space: normal;
        user-select: none;
      }

      .col-menu-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 240px;
        overflow-y: auto;
        scrollbar-width: thin;
        padding: 2px 4px;
      }

      .col-menu-item-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 30px;
        padding: 2px 4px 2px 6px;
        border-radius: 6px;
        transition: background-color 0.1s ease;
      }

      .col-menu-item-row:hover {
        background-color: var(--hover-bg);
      }

      .col-menu-item-row.is-hidden .collection-pill {
        opacity: 0.40;
      }

      .col-dots-btn {
        width: 25px;
        height: 24px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
        transition: background-color 0.1s ease, color 0.1s ease;
      }

      .col-dots-btn:hover,
      .col-dots-btn.active {
        background-color: var(--active-bg);
        color: var(--text-color);
      }

      .col-item-actions-menu {
        min-width: 168px;
      }

      .menu-row.danger-row {
        color: #e5484d;
      }

      :host([data-theme="dark"]) .menu-row.danger-row {
        color: #ff6b6b;
      }

      .menu-row.danger-row:hover {
        background-color: rgba(229, 72, 77, 0.12);
      }

      .menu-row.danger-row.confirming {
        font-weight: 600;
        background-color: rgba(229, 72, 77, 0.16);
      }

      /* Drag & Drop indicadores e fantasma */
      .mnt-drag-ghost {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
        pointer-events: none !important;
        opacity: 0.92;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
        border-radius: 7px;
        will-change: transform;
      }

      .mnt-drag-ghost-fav {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 26px;
        max-width: 210px;
        padding: 0 10px;
        background-color: var(--menu-bg);
        border: 1px solid var(--menu-border);
        color: var(--text-color);
        font-family: var(--mnt-font);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
      }

      .mnt-drag-ghost-fav img {
        width: 15px;
        height: 15px;
        flex-shrink: 0;
      }

      .mnt-drag-ghost-fav span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mnt-drop-indicator-v {
        position: fixed;
        width: 2px;
        height: 20px;
        border-radius: 2px;
        background-color: #3b9eff;
        z-index: 2147483647;
        pointer-events: none;
        display: none;
      }

      .mnt-drop-indicator-h {
        position: fixed;
        height: 2px;
        border-radius: 2px;
        background-color: #3b9eff;
        z-index: 2147483647;
        pointer-events: none;
        display: none;
      }
    `;
  }

  function createController(deps) {
    const {
      shadow,
      host,
      strip,
      getSettings,
      getBookmarks,
      saveSetting,
      isSafeUrl,
      getFaviconUrl,
      closeHostMenus,
      onOverlayStateChange,
      reRenderBar,
      reRenderSettingsMenu
    } = deps;

    // Estados ativos da UI de coleções
    let creationState = null;
    let inlineRenameState = null; // { colId, keepEditorOpen }
    let activeViewColId = null;
    let activeEditColId = null;
    let isStandaloneMenuOpen = false;
    let activeActionsColId = null;
    let pinnedSubmenuRow = null;

    // Cache de todos os favoritos do navegador durante edição
    let allBrowserBookmarks = [];
    let editorSearchQuery = "";
    let editorPage = 0;

    // Estado de Drag & Drop via Pointer Events
    let activeDrag = null;
    let suppressClickUntil = 0;

    // Elementos flutuantes no Shadow DOM
    const viewCard = document.createElement("div");
    viewCard.className = "col-view-card";

    const editorPanel = document.createElement("div");
    editorPanel.className = "col-editor-panel";

    const floatingStyleBar = document.createElement("div");
    floatingStyleBar.className = "col-floating-style-bar";

    const emojiPopover = document.createElement("div");
    emojiPopover.className = "col-emoji-popover";

    const standaloneMenu = document.createElement("div");
    standaloneMenu.className = "fluent-menu col-standalone-menu";

    const itemActionsMenu = document.createElement("div");
    itemActionsMenu.className = "fluent-menu col-item-actions-menu";

    const dropIndicatorV = document.createElement("div");
    dropIndicatorV.className = "mnt-drop-indicator-v";

    const dropIndicatorH = document.createElement("div");
    dropIndicatorH.className = "mnt-drop-indicator-h";

    shadow.appendChild(viewCard);
    shadow.appendChild(editorPanel);
    shadow.appendChild(floatingStyleBar);
    shadow.appendChild(emojiPopover);
    shadow.appendChild(standaloneMenu);
    shadow.appendChild(itemActionsMenu);
    shadow.appendChild(dropIndicatorV);
    shadow.appendChild(dropIndicatorH);

    // Impede que cliques internos nestes painéis disparem o fechamento de fora
    [viewCard, editorPanel, floatingStyleBar, emojiPopover, standaloneMenu, itemActionsMenu].forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    function getCollections() {
      const s = getSettings();
      return Array.isArray(s?.collections) ? s.collections : [];
    }

    function findCollection(colId) {
      return getCollections().find((c) => c.id === colId) || null;
    }

    function hasAnyOpenOverlay() {
      return Boolean(
        creationState ||
        inlineRenameState ||
        activeViewColId ||
        activeEditColId ||
        isStandaloneMenuOpen ||
        activeActionsColId
      );
    }

    function notifyOverlayState() {
      if (typeof onOverlayStateChange === "function") {
        onOverlayStateChange(hasAnyOpenOverlay());
      }
    }

    function isActivelyEditing() {
      return Boolean(creationState || inlineRenameState || activeEditColId);
    }

    function isViewOpen() {
      return Boolean(activeViewColId);
    }

    function setCardColorGradient(cardEl, hexColor, anchorLeft, cardLeft) {
      const { r, g, b } = hexToRgb(hexColor);
      const gradX = Math.max(18, Math.min(240, Math.round(anchorLeft - cardLeft + 26)));
      cardEl.style.setProperty("--col-r", String(r));
      cardEl.style.setProperty("--col-g", String(g));
      cardEl.style.setProperty("--col-b", String(b));
      cardEl.style.setProperty("--col-grad-x", `${gradX}px`);
    }

    function findPillElementOnBar(colId) {
      return strip.querySelector(`.collection-pill[data-col-id="${colId}"]`);
    }

    function updateBarDimmingState() {
      const highlightedId = activeViewColId || activeEditColId;
      const pills = strip.querySelectorAll(".collection-pill");
      pills.forEach((pill) => {
        const id = pill.getAttribute("data-col-id");
        if (highlightedId && id !== highlightedId) {
          pill.classList.add("dimmed");
        } else {
          pill.classList.remove("dimmed");
        }
      });
    }

    function closeEmojiPopover() {
      emojiPopover.classList.remove("open");
      emojiPopover.textContent = "";
    }

    function closeItemActionsMenu() {
      activeActionsColId = null;
      itemActionsMenu.classList.remove("open");
      itemActionsMenu.textContent = "";
      shadow.querySelectorAll(".col-dots-btn.active").forEach((b) => b.classList.remove("active"));
      if (pinnedSubmenuRow) {
        pinnedSubmenuRow.classList.remove("open");
        pinnedSubmenuRow = null;
      }
    }

    function closeAllCollectionOverlays(options = {}) {
      const { commitPendingCreation = true, commitPendingRename = true, skipBarRender = false } = options;

      let needsBarRender = false;

      if (creationState) {
        if (commitPendingCreation) {
          finalizeCreation({ openEditorAfter: false, allowEmptyCancel: true, skipRender: true });
        } else {
          creationState = null;
        }
        needsBarRender = true;
      }

      if (inlineRenameState) {
        if (commitPendingRename) {
          commitInlineRename({ skipRender: true });
        } else {
          inlineRenameState = null;
        }
        needsBarRender = true;
      }

      if (activeViewColId || activeEditColId) {
        needsBarRender = true;
      }

      activeViewColId = null;
      activeEditColId = null;
      isStandaloneMenuOpen = false;

      viewCard.classList.remove("open");
      viewCard.textContent = "";
      editorPanel.classList.remove("open");
      editorPanel.textContent = "";
      floatingStyleBar.classList.remove("open");
      floatingStyleBar.textContent = "";
      standaloneMenu.classList.remove("open");
      standaloneMenu.textContent = "";
      closeEmojiPopover();
      closeItemActionsMenu();

      if (needsBarRender && !skipBarRender) {
        reRenderBar();
      } else {
        updateBarDimmingState();
      }
      notifyOverlayState();
    }

    // ============================================================================
    // SELETOR DE COR (NATIVO DO NAVEGADOR) E SELETOR DE EMOJI UNIVERSAL
    // ============================================================================
    function openEmojiPopover(anchorEl, onSelectEmoji) {
      if (emojiPopover.classList.contains("open") && emojiPopover._anchor === anchorEl) {
        closeEmojiPopover();
        return;
      }

      emojiPopover.textContent = "";
      emojiPopover._anchor = anchorEl;

      const customRow = document.createElement("div");
      customRow.className = "col-emoji-custom-row";

      const customInput = document.createElement("input");
      customInput.type = "text";
      customInput.className = "col-emoji-custom-input";
      customInput.placeholder = "Escolha ou digite (Win + .)";
      customInput.maxLength = 12;

      customInput.addEventListener("input", () => {
        const val = customInput.value.trim();
        if (val) {
          const chars = Array.from(val);
          const firstGlyph = chars.slice(0, 4).join("");
          onSelectEmoji(firstGlyph);
          closeEmojiPopover();
        }
      });

      customInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          closeEmojiPopover();
        }
      });

      customRow.appendChild(customInput);
      emojiPopover.appendChild(customRow);

      const grid = document.createElement("div");
      grid.className = "col-emoji-grid";

      COLLECTION_EMOJIS.forEach((em) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "col-emoji-cell";
        btn.textContent = em;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectEmoji(em);
          closeEmojiPopover();
        });
        grid.appendChild(btn);
      });

      emojiPopover.appendChild(grid);

      const rect = anchorEl.getBoundingClientRect();
      const popWidth = 224;
      const popHeight = 200;
      let left = Math.min(Math.max(8, rect.left), window.innerWidth - popWidth - 8);
      let top = rect.bottom + 6;
      if (top + popHeight > window.innerHeight - 8 && rect.top > popHeight + 12) {
        top = rect.top - popHeight - 6;
      }

      emojiPopover.style.left = `${left}px`;
      emojiPopover.style.top = `${top}px`;
      emojiPopover.classList.add("open");
    }

    function createStyleControlsElement(config) {
      const { getColor, getEmoji, onColorInput, onColorCommit, onEmojiSelect, onEmojiClear } = config;

      const wrap = document.createElement("div");
      wrap.className = "col-style-controls";

      // Botão quadrado de cor usando <input type="color"> nativo do navegador/sistema
      const colorSwatch = document.createElement("div");
      colorSwatch.className = "col-color-swatch";
      colorSwatch.title = "Escolher cor da coleção";
      colorSwatch.style.backgroundColor = getColor();

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = isValidHexColor(getColor()) ? getColor() : "#3b9eff";

      colorInput.addEventListener("input", (e) => {
        e.stopPropagation();
        const nextHex = colorInput.value;
        if (isValidHexColor(nextHex)) {
          colorSwatch.style.backgroundColor = nextHex;
          onColorInput(nextHex.toLowerCase());
        }
      });

      colorInput.addEventListener("change", (e) => {
        e.stopPropagation();
        const nextHex = colorInput.value;
        if (isValidHexColor(nextHex) && typeof onColorCommit === "function") {
          onColorCommit(nextHex.toLowerCase());
        }
      });

      colorSwatch.appendChild(colorInput);

      // Botão quadrado de emoji + botão circular X para remover emoji
      const emojiWrap = document.createElement("div");
      emojiWrap.className = "col-emoji-swatch-wrap";

      const emojiBtn = document.createElement("button");
      emojiBtn.type = "button";
      emojiBtn.className = "col-emoji-swatch";
      emojiBtn.title = "Escolher emoji";

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "col-emoji-clear";
      clearBtn.title = "Remover emoji";
      clearBtn.textContent = "x";

      const syncEmojiVisual = () => {
        const currentEmoji = getEmoji();
        emojiBtn.textContent = currentEmoji || "";
        clearBtn.style.display = currentEmoji ? "flex" : "none";
      };
      syncEmojiVisual();

      emojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEmojiPopover(emojiBtn, (chosenEmoji) => {
          onEmojiSelect(chosenEmoji);
          syncEmojiVisual();
        });
      });

      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeEmojiPopover();
        onEmojiClear();
        syncEmojiVisual();
      });

      emojiWrap.appendChild(emojiBtn);
      emojiWrap.appendChild(clearBtn);

      wrap.appendChild(colorSwatch);
      wrap.appendChild(emojiWrap);

      return { wrap, syncEmojiVisual, colorSwatch, colorInput };
    }

    // ============================================================================
    // CRIAÇÃO INLINE NA BARRA (IMAGEM 1)
    // ============================================================================
    function startCreatingCollection() {
      closeHostMenus();
      closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true, skipBarRender: true });

      creationState = {
        name: "",
        color: pickRandomColor(),
        previewEmoji: pickRandomEmoji(),
        emoji: "",
        colorTouched: false,
        emojiTouched: false,
        emojiCleared: false,
        showStyleControls: false,
        inputEl: null,
        triggerBtnEl: null
      };

      reRenderBar();
      notifyOverlayState();

      requestAnimationFrame(() => {
        if (creationState && creationState.inputEl) {
          try {
            creationState.inputEl.scrollIntoView({ block: "nearest", inline: "nearest" });
          } catch (e) {}
          creationState.inputEl.focus();
        }
      });
    }

    function renderFloatingCreationControls() {
      floatingStyleBar.textContent = "";
      if (!creationState || !creationState.showStyleControls || !creationState.triggerBtnEl) {
        floatingStyleBar.classList.remove("open");
        closeEmojiPopover();
        return;
      }

      const controls = createStyleControlsElement({
        getColor: () => creationState.color,
        getEmoji: () => {
          if (creationState.emojiCleared) return "";
          return creationState.emojiTouched ? creationState.emoji : creationState.previewEmoji;
        },
        onColorInput: (hex) => {
          if (!creationState) return;
          creationState.color = hex;
          creationState.colorTouched = true;
        },
        onColorCommit: () => {},
        onEmojiSelect: (em) => {
          if (!creationState) return;
          creationState.emoji = em;
          creationState.emojiTouched = true;
          creationState.emojiCleared = false;
          if (creationState.triggerBtnEl) {
            creationState.triggerBtnEl.textContent = em;
          }
        },
        onEmojiClear: () => {
          if (!creationState) return;
          creationState.emoji = "";
          creationState.emojiTouched = false;
          creationState.emojiCleared = true;
          if (creationState.triggerBtnEl) {
            creationState.triggerBtnEl.textContent = "[+]";
          }
        }
      });

      floatingStyleBar.appendChild(controls.wrap);

      const pillEl = creationState.triggerBtnEl.closest(".collection-create-pill") || creationState.triggerBtnEl;
      const rect = pillEl.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 90));
      floatingStyleBar.style.left = `${left}px`;
      floatingStyleBar.style.top = "38px";
      floatingStyleBar.classList.add("open");
    }

    function finalizeCreation(options = {}) {
      const { openEditorAfter = false, allowEmptyCancel = true, skipRender = false } = options;
      if (!creationState) return null;

      const rawName = (creationState.inputEl ? creationState.inputEl.value : creationState.name) || "";
      const cleanName = rawName.trim().slice(0, 60);
      const hasName = cleanName.length > 0;
      const hasExplicitEmoji = creationState.emojiTouched && Boolean(creationState.emoji);

      // Se não escreveu nome nem definiu emoji:
      if (!hasName && !hasExplicitEmoji) {
        if (allowEmptyCancel) {
          creationState = null;
          floatingStyleBar.classList.remove("open");
          floatingStyleBar.textContent = "";
          closeEmojiPopover();
          if (!skipRender) reRenderBar();
          notifyOverlayState();
        }
        return null;
      }

      // Resolve emoji e cor finais (aleatórios caso não definidos, ou vazio se o usuário clicou no X)
      let finalEmoji = "";
      if (creationState.emojiCleared) {
        finalEmoji = "";
      } else if (hasExplicitEmoji) {
        finalEmoji = creationState.emoji;
      } else {
        finalEmoji = creationState.previewEmoji || pickRandomEmoji();
      }

      const finalColor = isValidHexColor(creationState.color) ? creationState.color : pickRandomColor();

      const newCol = {
        id: generateCollectionId(),
        name: cleanName,
        emoji: finalEmoji,
        color: finalColor,
        hidden: false,
        items: []
      };

      const nextCollections = [...getCollections(), newCol];
      creationState = null;
      floatingStyleBar.classList.remove("open");
      floatingStyleBar.textContent = "";
      closeEmojiPopover();

      saveSetting({ collections: nextCollections }, () => {
        reRenderSettingsMenu();
      });

      if (!skipRender) {
        reRenderBar();
      }

      if (openEditorAfter) {
        requestAnimationFrame(() => {
          openCollectionEditor(newCol.id);
        });
      } else {
        notifyOverlayState();
      }

      return newCol;
    }

    // ============================================================================
    // RENOMEAÇÃO INLINE NA PRÓPRIA PÍLULA DA BARRA
    // ============================================================================
    function startInlineRename(colId, options = {}) {
      const col = findCollection(colId);
      if (!col) return;

      const keepEditorOpen = Boolean(options.keepEditorOpen && activeEditColId === colId);
      if (!keepEditorOpen) {
        closeHostMenus();
        closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true, skipBarRender: true });
      }

      inlineRenameState = {
        colId,
        keepEditorOpen,
        inputEl: null
      };

      reRenderBar();
      notifyOverlayState();

      requestAnimationFrame(() => {
        if (inlineRenameState && inlineRenameState.inputEl) {
          inlineRenameState.inputEl.focus();
          inlineRenameState.inputEl.select();
        }
      });
    }

    function commitInlineRename(options = {}) {
      const { skipRender = false } = options;
      if (!inlineRenameState) return;

      const { colId, inputEl } = inlineRenameState;
      const col = findCollection(colId);
      if (col && inputEl) {
        let nextName = inputEl.value.trim().slice(0, 60);
        // Garante que uma coleção sem emoji não fique completamente invisível na barra
        if (!nextName && !col.emoji) {
          nextName = col.name || "Coleção";
        }
        if (nextName !== col.name) {
          const updated = getCollections().map((c) => (c.id === colId ? { ...c, name: nextName } : c));
          saveSetting({ collections: updated }, () => {
            reRenderSettingsMenu();
          });
        }
      }

      inlineRenameState = null;
      if (!skipRender) {
        reRenderBar();
        if (activeEditColId === colId) {
          repositionEditorToPill(colId);
        }
      }
      notifyOverlayState();
    }

    // ============================================================================
    // VISUALIZAÇÃO DA COLEÇÃO ABERTA (IMAGEM 2)
    // ============================================================================
    function openCollectionView(colId) {
      const col = findCollection(colId);
      if (!col) return;

      // Se o editor desta mesma coleção já estiver aberto, tocar na coleção permite editar o nome inline
      if (activeEditColId === colId) {
        startInlineRename(colId, { keepEditorOpen: true });
        return;
      }

      // Clicar novamente na coleção já aberta fecha ela
      if (activeViewColId === colId) {
        closeAllCollectionOverlays();
        return;
      }

      closeHostMenus();
      closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true, skipBarRender: true });

      activeViewColId = colId;
      updateBarDimmingState();
      renderViewCardContent(col);
      notifyOverlayState();
    }

    function renderViewCardContent(col) {
      viewCard.textContent = "";
      const pillEl = findPillElementOnBar(col.id);
      const pillRect = pillEl ? pillEl.getBoundingClientRect() : { left: 12 };

      const cardWidth = 246;
      const cardLeft = Math.max(8, Math.min(pillRect.left, window.innerWidth - cardWidth - 8));
      viewCard.style.left = `${cardLeft}px`;
      viewCard.style.top = "38px";
      setCardColorGradient(viewCard, col.color, pillRect.left, cardLeft);

      const validItems = Array.isArray(col.items) ? col.items.filter((it) => it && isSafeUrl(it.url)) : [];

      if (validItems.length === 0) {
        const emptyWrap = document.createElement("div");
        emptyWrap.className = "col-view-empty";

        const msg = document.createElement("span");
        msg.textContent = "Nenhum favorito nesta coleção";

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "col-view-add-btn";
        addBtn.textContent = "Adicionar favoritos";
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openCollectionEditor(col.id);
        });

        emptyWrap.appendChild(msg);
        emptyWrap.appendChild(addBtn);
        viewCard.appendChild(emptyWrap);
      } else {
        validItems.forEach((item, index) => {
          const link = document.createElement("a");
          link.className = "col-view-row";
          link.href = item.url;
          link.draggable = false;
          link.dataset.itemIndex = String(index);
          link.title = `${item.title || ""}\n${item.url}`;

          const img = document.createElement("img");
          img.src = getFaviconUrl(item.url);
          img.draggable = false;

          const label = document.createElement("span");
          label.textContent = item.title || item.url;

          link.appendChild(img);
          link.appendChild(label);

          link.addEventListener("click", (e) => {
            if (Date.now() < suppressClickUntil) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            closeAllCollectionOverlays();
          });

          attachCollectionItemReorderDrag(link, col.id, index, viewCard, false);
          viewCard.appendChild(link);
        });
      }

      viewCard.classList.add("open");
    }

    // ============================================================================
    // EDITOR COMPLETO DA COLEÇÃO (IMAGEM 3)
    // ============================================================================
    function repositionEditorToPill(colId) {
      const col = findCollection(colId);
      if (!col || activeEditColId !== colId) return;
      const pillEl = findPillElementOnBar(colId);
      const pillRect = pillEl ? pillEl.getBoundingClientRect() : { left: 12 };
      const panelWidth = 292;
      const left = Math.max(8, Math.min(pillRect.left, window.innerWidth - panelWidth - 8));
      editorPanel.style.left = `${left}px`;
      editorPanel.style.top = "38px";

      const dropBox = editorPanel.querySelector(".col-dropzone-box");
      if (dropBox) {
        setCardColorGradient(dropBox, col.color, pillRect.left, left);
      }
    }

    function openCollectionEditor(colId) {
      let col = findCollection(colId);
      if (!col) return;

      closeHostMenus();
      closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true, skipBarRender: true });

      // Se a coleção estava oculta, exibe na barra para que a edição abra alinhada abaixo dela
      if (col.hidden) {
        const unhidden = getCollections().map((c) => (c.id === colId ? { ...c, hidden: false } : c));
        saveSetting({ collections: unhidden }, () => {
          reRenderSettingsMenu();
        });
        reRenderBar();
        col = findCollection(colId) || col;
      }

      activeEditColId = colId;
      editorSearchQuery = "";
      editorPage = 0;
      updateBarDimmingState();
      notifyOverlayState();

      buildEditorPanelDOM(col);
      refreshAllBrowserBookmarks();
    }

    function refreshAllBrowserBookmarks() {
      chrome.runtime.sendMessage({ action: "getAllBookmarks" }, (res) => {
        if (chrome.runtime.lastError || !res || !Array.isArray(res.bookmarks)) {
          // Fallback para os favoritos da barra caso necessário
          const fallback = [];
          (getBookmarks() || []).forEach((n) => {
            if (n && n.url && isSafeUrl(n.url)) {
              fallback.push({ id: String(n.id || ""), title: n.title || n.url, url: n.url });
            }
          });
          allBrowserBookmarks = fallback;
        } else {
          allBrowserBookmarks = res.bookmarks.filter((b) => b && isSafeUrl(b.url));
        }
        if (activeEditColId) {
          renderEditorLists();
        }
      });
    }

    function buildEditorPanelDOM(col) {
      editorPanel.textContent = "";

      const pillEl = findPillElementOnBar(col.id);
      const pillRect = pillEl ? pillEl.getBoundingClientRect() : { left: 12 };
      const panelWidth = 292;
      const left = Math.max(8, Math.min(pillRect.left, window.innerWidth - panelWidth - 8));
      editorPanel.style.left = `${left}px`;
      editorPanel.style.top = "38px";

      // Caixa 1: Favoritos da coleção / Área de soltar ("arraste até aqui")
      const dropzoneBox = document.createElement("div");
      dropzoneBox.className = "col-dropzone-box";
      setCardColorGradient(dropzoneBox, col.color, pillRect.left, left);

      // Caixa 2: Todos os favoritos do usuário + Pesquisa + Paginação
      const pickerBox = document.createElement("div");
      pickerBox.className = "col-picker-box";

      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "col-search-input";
      searchInput.placeholder = "Pesquise nos favoritos";
      searchInput.addEventListener("input", () => {
        editorSearchQuery = searchInput.value;
        editorPage = 0;
        renderEditorPickerOnly();
      });
      searchInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          closeAllCollectionOverlays();
        }
      });

      const pickerList = document.createElement("div");
      pickerList.className = "col-picker-list";

      // Suporte suave à roda do mouse para navegar entre as telas de favoritos
      let wheelCooldown = 0;
      pickerList.addEventListener(
        "wheel",
        (e) => {
          if (Math.abs(e.deltaY) < 12) return;
          const now = Date.now();
          if (now - wheelCooldown < 180) return;
          wheelCooldown = now;
          const totalPages = Number(pickerList.dataset.totalPages || "1");
          if (totalPages <= 1) return;
          e.preventDefault();
          if (e.deltaY > 0 && editorPage < totalPages - 1) {
            editorPage++;
            renderEditorPickerOnly();
          } else if (e.deltaY < 0 && editorPage > 0) {
            editorPage--;
            renderEditorPickerOnly();
          }
        },
        { passive: false }
      );

      const paginationBar = document.createElement("div");
      paginationBar.className = "col-pagination";

      pickerBox.appendChild(searchInput);
      pickerBox.appendChild(pickerList);
      pickerBox.appendChild(paginationBar);

      // Linha 3: Controles de Cor e Emoji
      const styleControls = createStyleControlsElement({
        getColor: () => findCollection(col.id)?.color || col.color,
        getEmoji: () => findCollection(col.id)?.emoji || "",
        onColorInput: (hex) => {
          const current = findCollection(col.id);
          if (!current) return;
          const pill = findPillElementOnBar(col.id);
          if (pill) {
            pill.style.backgroundColor = hex;
            pill.style.color = getContrastingTextColor(hex);
          }
          const pRect = pill ? pill.getBoundingClientRect() : pillRect;
          const curLeft = parseFloat(editorPanel.style.left) || left;
          setCardColorGradient(dropzoneBox, hex, pRect.left, curLeft);
        },
        onColorCommit: (hex) => {
          const updated = getCollections().map((c) => (c.id === col.id ? { ...c, color: hex } : c));
          saveSetting({ collections: updated }, () => {
            reRenderBar();
            reRenderSettingsMenu();
          });
        },
        onEmojiSelect: (em) => {
          const updated = getCollections().map((c) => (c.id === col.id ? { ...c, emoji: em } : c));
          saveSetting({ collections: updated }, () => {
            reRenderSettingsMenu();
          });
          reRenderBar();
          repositionEditorToPill(col.id);
        },
        onEmojiClear: () => {
          const current = findCollection(col.id);
          if (!current) return;
          const safeName = !current.name ? "Coleção" : current.name;
          const updated = getCollections().map((c) =>
            c.id === col.id ? { ...c, emoji: "", name: safeName } : c
          );
          saveSetting({ collections: updated }, () => {
            reRenderSettingsMenu();
          });
          reRenderBar();
          repositionEditorToPill(col.id);
        }
      });

      editorPanel.appendChild(dropzoneBox);
      editorPanel.appendChild(pickerBox);
      editorPanel.appendChild(styleControls.wrap);
      editorPanel.classList.add("open");

      renderEditorLists();
    }

    function addBookmarkToCollection(colId, bm, targetIndex) {
      const col = findCollection(colId);
      if (!col || !bm || !isSafeUrl(bm.url)) return;
      if (col.items.some((it) => it.url === bm.url)) return;

      const nextItems = col.items.slice();
      const entry = {
        id: String(bm.id || `bm_${Date.now().toString(36)}`),
        title: String(bm.title || bm.url).slice(0, 200),
        url: bm.url
      };

      if (typeof targetIndex === "number" && targetIndex >= 0 && targetIndex <= nextItems.length) {
        nextItems.splice(targetIndex, 0, entry);
      } else {
        nextItems.push(entry);
      }

      const updated = getCollections().map((c) => (c.id === colId ? { ...c, items: nextItems } : c));
      saveSetting({ collections: updated }, () => {
        reRenderSettingsMenu();
      });

      if (activeEditColId === colId) {
        renderEditorLists();
      }
    }

    function removeBookmarkFromCollection(colId, itemIndex) {
      const col = findCollection(colId);
      if (!col) return;
      const nextItems = col.items.filter((_, idx) => idx !== itemIndex);
      const updated = getCollections().map((c) => (c.id === colId ? { ...c, items: nextItems } : c));
      saveSetting({ collections: updated }, () => {
        reRenderSettingsMenu();
      });

      if (activeEditColId === colId) {
        renderEditorLists();
      } else if (activeViewColId === colId) {
        const refreshed = findCollection(colId);
        if (refreshed) renderViewCardContent(refreshed);
      }
    }

    function reorderCollectionItems(colId, fromIndex, toIndex) {
      const col = findCollection(colId);
      if (!col || !Array.isArray(col.items)) return;
      if (fromIndex < 0 || fromIndex >= col.items.length) return;

      const nextItems = col.items.slice();
      const [moved] = nextItems.splice(fromIndex, 1);
      const adjustedTarget = toIndex > fromIndex ? toIndex - 1 : toIndex;
      const clampedTarget = Math.max(0, Math.min(nextItems.length, adjustedTarget));
      if (clampedTarget === fromIndex) return;

      nextItems.splice(clampedTarget, 0, moved);
      const updated = getCollections().map((c) => (c.id === colId ? { ...c, items: nextItems } : c));
      saveSetting({ collections: updated }, () => {
        reRenderSettingsMenu();
      });

      if (activeEditColId === colId) {
        renderEditorDropzoneOnly();
      } else if (activeViewColId === colId) {
        const refreshed = findCollection(colId);
        if (refreshed) renderViewCardContent(refreshed);
      }
    }

    function renderEditorDropzoneOnly() {
      if (!activeEditColId) return;
      const col = findCollection(activeEditColId);
      const dropzoneBox = editorPanel.querySelector(".col-dropzone-box");
      if (!col || !dropzoneBox) return;

      dropzoneBox.textContent = "";
      const items = Array.isArray(col.items) ? col.items : [];

      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "col-dropzone-empty";
        empty.textContent = "arraste até aqui";
        dropzoneBox.appendChild(empty);
        return;
      }

      items.forEach((item, idx) => {
        if (!item || !isSafeUrl(item.url)) return;

        const row = document.createElement("div");
        row.className = "col-fav-row col-drop-item-row";
        row.dataset.itemIndex = String(idx);
        row.title = `${item.title || ""}\n${item.url}`;

        const left = document.createElement("div");
        left.className = "col-fav-row-left";

        const img = document.createElement("img");
        img.src = getFaviconUrl(item.url);
        img.draggable = false;

        const titleSpan = document.createElement("span");
        titleSpan.textContent = item.title || item.url;

        left.appendChild(img);
        left.appendChild(titleSpan);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "col-fav-action-btn";
        removeBtn.title = "Remover da coleção";
        removeBtn.innerHTML = COL_ICONS.minus;
        removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeBookmarkFromCollection(col.id, idx);
        });

        row.appendChild(left);
        row.appendChild(removeBtn);

        attachCollectionItemReorderDrag(row, col.id, idx, dropzoneBox, true);
        dropzoneBox.appendChild(row);
      });
    }

    function renderEditorPickerOnly() {
      if (!activeEditColId) return;
      const col = findCollection(activeEditColId);
      const pickerList = editorPanel.querySelector(".col-picker-list");
      const paginationBar = editorPanel.querySelector(".col-pagination");
      if (!col || !pickerList || !paginationBar) return;

      pickerList.textContent = "";
      paginationBar.textContent = "";

      const existingUrls = new Set((col.items || []).map((it) => it.url));
      const q = editorSearchQuery.trim().toLowerCase();

      const filtered = allBrowserBookmarks.filter((bm) => {
        if (!bm || !isSafeUrl(bm.url) || existingUrls.has(bm.url)) return false;
        if (!q) return true;
        const t = (bm.title || "").toLowerCase();
        const u = bm.url.toLowerCase();
        return t.includes(q) || u.includes(q);
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
      if (editorPage >= totalPages) editorPage = totalPages - 1;
      if (editorPage < 0) editorPage = 0;
      pickerList.dataset.totalPages = String(totalPages);

      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "col-picker-empty";
        empty.textContent = q
          ? "Nenhum favorito encontrado"
          : allBrowserBookmarks.length === 0
            ? "Nenhum favorito salvo no navegador"
            : "Todos os seus favoritos já estão nesta coleção";
        pickerList.appendChild(empty);
        paginationBar.style.display = "none";
        return;
      }

      const sliceStart = editorPage * ITEMS_PER_PAGE;
      const pageItems = filtered.slice(sliceStart, sliceStart + ITEMS_PER_PAGE);

      pageItems.forEach((bm) => {
        const row = document.createElement("div");
        row.className = "col-fav-row col-picker-item-row";
        row.title = `${bm.title || ""}\n${bm.url}`;

        const left = document.createElement("div");
        left.className = "col-fav-row-left";

        const img = document.createElement("img");
        img.src = getFaviconUrl(bm.url);
        img.draggable = false;

        const titleSpan = document.createElement("span");
        titleSpan.textContent = bm.title || bm.url;

        left.appendChild(img);
        left.appendChild(titleSpan);

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "col-fav-action-btn";
        addBtn.title = "Adicionar à coleção";
        addBtn.innerHTML = COL_ICONS.plus;
        addBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addBookmarkToCollection(col.id, bm);
        });

        row.appendChild(left);
        row.appendChild(addBtn);

        attachPickerBookmarkDrag(row, col.id, bm);
        pickerList.appendChild(row);
      });

      if (totalPages <= 1) {
        paginationBar.style.display = "none";
      } else {
        paginationBar.style.display = "flex";

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "col-page-nav";
        prevBtn.disabled = editorPage === 0;
        prevBtn.innerHTML = COL_ICONS.chevronLeft;
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (editorPage > 0) {
            editorPage--;
            renderEditorPickerOnly();
          }
        });

        const dotsWrap = document.createElement("div");
        dotsWrap.className = "col-page-dots";

        const maxVisibleDots = 7;
        let startDot = 0;
        let endDot = totalPages;
        if (totalPages > maxVisibleDots) {
          startDot = Math.max(0, Math.min(editorPage - 3, totalPages - maxVisibleDots));
          endDot = startDot + maxVisibleDots;
        }

        for (let p = startDot; p < endDot; p++) {
          const dot = document.createElement("button");
          dot.type = "button";
          dot.className = "col-page-dot" + (p === editorPage ? " active" : "");
          dot.title = `Página ${p + 1}`;
          dot.addEventListener("click", (e) => {
            e.stopPropagation();
            editorPage = p;
            renderEditorPickerOnly();
          });
          dotsWrap.appendChild(dot);
        }

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "col-page-nav";
        nextBtn.disabled = editorPage >= totalPages - 1;
        nextBtn.innerHTML = COL_ICONS.chevronRight;
        nextBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (editorPage < totalPages - 1) {
            editorPage++;
            renderEditorPickerOnly();
          }
        });

        paginationBar.appendChild(prevBtn);
        paginationBar.appendChild(dotsWrap);
        paginationBar.appendChild(nextBtn);
      }
    }

    function renderEditorLists() {
      renderEditorDropzoneOnly();
      renderEditorPickerOnly();
    }

    // ============================================================================
    // DRAG & DROP VIA POINTER EVENTS (60FPS, ISOLADO NO SHADOW DOM)
    // ============================================================================
    function createFavDragGhost(titleText, url) {
      const ghost = document.createElement("div");
      ghost.className = "mnt-drag-ghost mnt-drag-ghost-fav";
      if (url && isSafeUrl(url)) {
        const img = document.createElement("img");
        img.src = getFaviconUrl(url);
        ghost.appendChild(img);
      }
      const span = document.createElement("span");
      span.textContent = titleText || url || "";
      ghost.appendChild(span);
      shadow.appendChild(ghost);
      return ghost;
    }

    function cleanupActiveDrag() {
      if (!activeDrag) return;
      if (activeDrag.ghostEl) activeDrag.ghostEl.remove();
      if (activeDrag.sourceEl) activeDrag.sourceEl.classList.remove("drag-source");
      dropIndicatorV.style.display = "none";
      dropIndicatorH.style.display = "none";
      const dropBox = editorPanel.querySelector(".col-dropzone-box");
      if (dropBox) dropBox.classList.remove("drag-over");
      const pickerBox = editorPanel.querySelector(".col-picker-box");
      if (pickerBox) pickerBox.classList.remove("drag-remove-over");
      window.removeEventListener("pointermove", onGlobalPointerMove);
      window.removeEventListener("pointerup", onGlobalPointerUp);
      window.removeEventListener("pointercancel", onGlobalPointerCancel);
      activeDrag = null;
    }

    function computeHorizontalInsertIndex(elements, clientX) {
      for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (clientX < midX) {
          return { index: i, indicatorX: rect.left - 2, indicatorY: rect.top + (rect.height - 20) / 2 };
        }
      }
      const lastRect = elements[elements.length - 1].getBoundingClientRect();
      return {
        index: elements.length,
        indicatorX: lastRect.right + 1,
        indicatorY: lastRect.top + (lastRect.height - 20) / 2
      };
    }

    function computeVerticalInsertIndex(rows, containerRect, clientY) {
      if (rows.length === 0) {
        return {
          index: 0,
          indicatorY: containerRect.top + containerRect.height / 2,
          indicatorX: containerRect.left + 8,
          indicatorWidth: containerRect.width - 16
        };
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        const midY = r.top + r.height / 2;
        if (clientY < midY) {
          return {
            index: i,
            indicatorY: r.top - 1,
            indicatorX: r.left + 6,
            indicatorWidth: r.width - 12
          };
        }
      }
      const lastR = rows[rows.length - 1].getBoundingClientRect();
      return {
        index: rows.length,
        indicatorY: lastR.bottom + 1,
        indicatorX: lastR.left + 6,
        indicatorWidth: lastR.width - 12
      };
    }

    function onGlobalPointerMove(e) {
      if (!activeDrag) return;
      const dx = e.clientX - activeDrag.startX;
      const dy = e.clientY - activeDrag.startY;

      if (!activeDrag.started) {
        if (Math.hypot(dx, dy) < 5) return;
        activeDrag.started = true;
        activeDrag.sourceEl.classList.add("drag-source");
        activeDrag.ghostEl = activeDrag.createGhost();
      }

      e.preventDefault();
      if (activeDrag.ghostEl) {
        activeDrag.ghostEl.style.transform = `translate3d(${e.clientX + 10}px, ${e.clientY + 10}px, 0)`;
      }

      // Auto-scroll horizontal na barra se necessário
      if (activeDrag.kind === "bar-collection" || activeDrag.kind === "bar-bookmark") {
        const stripRect = strip.getBoundingClientRect();
        if (e.clientX < stripRect.left + 28) strip.scrollLeft -= 8;
        else if (e.clientX > stripRect.right - 28) strip.scrollLeft += 8;
      }

      if (activeDrag.kind === "bar-collection") {
        const pills = Array.from(strip.querySelectorAll(".collection-pill"));
        if (pills.length === 0) return;
        const hit = computeHorizontalInsertIndex(pills, e.clientX);
        activeDrag.targetIndex = hit.index;
        dropIndicatorV.style.left = `${hit.indicatorX}px`;
        dropIndicatorV.style.top = `${hit.indicatorY}px`;
        dropIndicatorV.style.display = "block";
        return;
      }

      if (activeDrag.kind === "bar-bookmark") {
        const items = Array.from(strip.querySelectorAll(".item[data-bookmark-id]"));
        if (items.length === 0) return;
        const hit = computeHorizontalInsertIndex(items, e.clientX);
        activeDrag.targetIndex = hit.index;
        dropIndicatorV.style.left = `${hit.indicatorX}px`;
        dropIndicatorV.style.top = `${hit.indicatorY}px`;
        dropIndicatorV.style.display = "block";
        return;
      }

      if (activeDrag.kind === "picker-to-col") {
        const dropBox = editorPanel.querySelector(".col-dropzone-box");
        if (!dropBox) return;
        const boxRect = dropBox.getBoundingClientRect();
        const inside =
          e.clientX >= boxRect.left - 14 &&
          e.clientX <= boxRect.right + 14 &&
          e.clientY >= boxRect.top - 14 &&
          e.clientY <= boxRect.bottom + 14;

        activeDrag.overDropzone = inside;
        if (inside) {
          dropBox.classList.add("drag-over");
          const rows = Array.from(dropBox.querySelectorAll(".col-drop-item-row"));
          const hit = computeVerticalInsertIndex(rows, boxRect, e.clientY);
          activeDrag.targetIndex = hit.index;
          if (rows.length > 0) {
            dropIndicatorH.style.left = `${hit.indicatorX}px`;
            dropIndicatorH.style.top = `${hit.indicatorY}px`;
            dropIndicatorH.style.width = `${hit.indicatorWidth}px`;
            dropIndicatorH.style.display = "block";
          } else {
            dropIndicatorH.style.display = "none";
          }
        } else {
          dropBox.classList.remove("drag-over");
          dropIndicatorH.style.display = "none";
        }
        return;
      }

      if (activeDrag.kind === "col-item-reorder") {
        const containerEl = activeDrag.containerEl;
        if (!containerEl) return;

        // Se estiver no editor e arrastar de volta para a caixa de todos os favoritos, marca remoção
        if (activeDrag.allowRemoveToPicker) {
          const pickerBox = editorPanel.querySelector(".col-picker-box");
          if (pickerBox) {
            const pRect = pickerBox.getBoundingClientRect();
            const overPicker =
              e.clientX >= pRect.left &&
              e.clientX <= pRect.right &&
              e.clientY >= pRect.top &&
              e.clientY <= pRect.bottom;
            activeDrag.overRemoveZone = overPicker;
            if (overPicker) {
              pickerBox.classList.add("drag-remove-over");
              dropIndicatorH.style.display = "none";
              return;
            } else {
              pickerBox.classList.remove("drag-remove-over");
            }
          }
        }

        const cRect = containerEl.getBoundingClientRect();
        if (e.clientY < cRect.top + 20) containerEl.scrollTop -= 6;
        else if (e.clientY > cRect.bottom - 20) containerEl.scrollTop += 6;

        const selector = activeDrag.allowRemoveToPicker ? ".col-drop-item-row" : ".col-view-row";
        const rows = Array.from(containerEl.querySelectorAll(selector));
        if (rows.length <= 1) return;
        const hit = computeVerticalInsertIndex(rows, cRect, e.clientY);
        activeDrag.targetIndex = hit.index;
        dropIndicatorH.style.left = `${hit.indicatorX}px`;
        dropIndicatorH.style.top = `${hit.indicatorY}px`;
        dropIndicatorH.style.width = `${hit.indicatorWidth}px`;
        dropIndicatorH.style.display = "block";
      }
    }

    function onGlobalPointerUp() {
      if (!activeDrag) return;
      const drag = activeDrag;
      cleanupActiveDrag();

      if (!drag.started) return;
      suppressClickUntil = Date.now() + 180;

      if (drag.kind === "bar-collection" && typeof drag.targetIndex === "number") {
        reorderVisibleCollections(drag.colId, drag.targetIndex);
        return;
      }

      if (drag.kind === "bar-bookmark" && typeof drag.targetIndex === "number") {
        reorderBarBookmarkItem(drag.bookmarkId, drag.targetIndex);
        return;
      }

      if (drag.kind === "picker-to-col" && drag.overDropzone) {
        addBookmarkToCollection(drag.colId, drag.bookmark, drag.targetIndex);
        return;
      }

      if (drag.kind === "col-item-reorder") {
        if (drag.overRemoveZone) {
          removeBookmarkFromCollection(drag.colId, drag.fromIndex);
        } else if (typeof drag.targetIndex === "number") {
          reorderCollectionItems(drag.colId, drag.fromIndex, drag.targetIndex);
        }
      }
    }

    function onGlobalPointerCancel() {
      cleanupActiveDrag();
    }

    function startPointerDragSession(config, e) {
      if (e.button !== 0) return;
      cleanupActiveDrag();
      activeDrag = {
        ...config,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        ghostEl: null,
        targetIndex: null,
        overDropzone: false,
        overRemoveZone: false
      };
      window.addEventListener("pointermove", onGlobalPointerMove, { passive: false });
      window.addEventListener("pointerup", onGlobalPointerUp);
      window.addEventListener("pointercancel", onGlobalPointerCancel);
    }

    function attachCollectionBarDrag(pillEl, col) {
      pillEl.addEventListener("dragstart", (e) => e.preventDefault());
      pillEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target.tagName === "INPUT") return;
        startPointerDragSession(
          {
            kind: "bar-collection",
            colId: col.id,
            sourceEl: pillEl,
            createGhost: () => {
              const g = pillEl.cloneNode(true);
              g.classList.remove("drag-source", "dimmed");
              g.classList.add("mnt-drag-ghost");
              shadow.appendChild(g);
              return g;
            }
          },
          e
        );
      });
    }

    function attachBookmarkBarDrag(itemEl, bookmarkId) {
      if (!itemEl || !bookmarkId) return;
      itemEl.dataset.bookmarkId = String(bookmarkId);
      itemEl.draggable = false;
      itemEl.addEventListener("dragstart", (e) => e.preventDefault());
      itemEl.addEventListener(
        "click",
        (e) => {
          if (Date.now() < suppressClickUntil) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true
      );
      itemEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        startPointerDragSession(
          {
            kind: "bar-bookmark",
            bookmarkId: String(bookmarkId),
            sourceEl: itemEl,
            createGhost: () => {
              const g = itemEl.cloneNode(true);
              g.classList.remove("drag-source", "active");
              g.classList.add("mnt-drag-ghost");
              g.style.backgroundColor = "var(--menu-bg)";
              g.style.border = "1px solid var(--menu-border)";
              shadow.appendChild(g);
              return g;
            }
          },
          e
        );
      });
    }

    function attachPickerBookmarkDrag(rowEl, colId, bm) {
      rowEl.addEventListener("dragstart", (e) => e.preventDefault());
      rowEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        startPointerDragSession(
          {
            kind: "picker-to-col",
            colId,
            bookmark: bm,
            sourceEl: rowEl,
            createGhost: () => createFavDragGhost(bm.title, bm.url)
          },
          e
        );
      });
    }

    function attachCollectionItemReorderDrag(rowEl, colId, itemIndex, containerEl, allowRemoveToPicker) {
      rowEl.addEventListener("dragstart", (e) => e.preventDefault());
      rowEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const col = findCollection(colId);
        const item = col?.items?.[itemIndex];
        startPointerDragSession(
          {
            kind: "col-item-reorder",
            colId,
            fromIndex: itemIndex,
            containerEl,
            allowRemoveToPicker,
            sourceEl: rowEl,
            createGhost: () => createFavDragGhost(item?.title, item?.url)
          },
          e
        );
      });
    }

    function reorderVisibleCollections(colId, targetVisibleIndex) {
      const all = getCollections();
      const visible = all.filter((c) => !c.hidden);
      const fromIndex = visible.findIndex((c) => c.id === colId);
      if (fromIndex < 0) return;

      const reorderedVisible = visible.slice();
      const [moved] = reorderedVisible.splice(fromIndex, 1);
      const adjusted = targetVisibleIndex > fromIndex ? targetVisibleIndex - 1 : targetVisibleIndex;
      const clamped = Math.max(0, Math.min(reorderedVisible.length, adjusted));
      if (clamped === fromIndex) return;
      reorderedVisible.splice(clamped, 0, moved);

      // Reconstrói a lista preservando coleções ocultas em suas posições relativas
      let visPtr = 0;
      const merged = all.map((c) => (c.hidden ? c : reorderedVisible[visPtr++]));

      saveSetting({ collections: merged }, () => {
        reRenderSettingsMenu();
      });
      reRenderBar();
      if (activeEditColId) repositionEditorToPill(activeEditColId);
      if (activeViewColId) {
        const openCol = findCollection(activeViewColId);
        if (openCol) renderViewCardContent(openCol);
      }
    }

    function reorderBarBookmarkItem(bookmarkId, targetIndex) {
      const currentOrdered = sortBarBookmarks(getBookmarks(), getSettings()?.barBookmarksOrder);
      const ids = currentOrdered.map((n) => String(n.id));
      const fromIndex = ids.indexOf(String(bookmarkId));
      if (fromIndex < 0) return;

      const [moved] = ids.splice(fromIndex, 1);
      const adjusted = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
      const clamped = Math.max(0, Math.min(ids.length, adjusted));
      if (clamped === fromIndex) return;
      ids.splice(clamped, 0, moved);

      saveSetting({ barBookmarksOrder: ids });
      reRenderBar();
    }

    // ============================================================================
    // RENDERIZAÇÃO DAS PÍLULAS DE COLEÇÃO NA BARRA PRINCIPAL
    // ============================================================================
    function createCollectionPillVisual(col, options = {}) {
      const { interactiveOnBar = false } = options;
      const pill = document.createElement(interactiveOnBar ? "div" : "span");
      pill.className = "collection-pill";
      pill.dataset.colId = col.id;
      pill.style.backgroundColor = col.color;
      pill.style.color = getContrastingTextColor(col.color);

      if (col.emoji) {
        const emojiSpan = document.createElement("span");
        emojiSpan.className = "collection-pill-emoji";
        emojiSpan.textContent = col.emoji;
        pill.appendChild(emojiSpan);
      }

      if (interactiveOnBar && inlineRenameState && inlineRenameState.colId === col.id) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "collection-pill-inline-input";
        input.value = col.name || "";
        input.placeholder = "Nome...";
        input.maxLength = 60;
        inlineRenameState.inputEl = input;

        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commitInlineRename();
          } else if (e.key === "Escape") {
            e.preventDefault();
            inlineRenameState = null;
            reRenderBar();
            notifyOverlayState();
          }
        });

        pill.appendChild(input);
      } else if (col.name) {
        const nameSpan = document.createElement("span");
        nameSpan.className = "collection-pill-name";
        nameSpan.textContent = col.name;
        pill.appendChild(nameSpan);
      } else if (!col.emoji) {
        const fallbackSpan = document.createElement("span");
        fallbackSpan.className = "collection-pill-name";
        fallbackSpan.textContent = "Coleção";
        pill.appendChild(fallbackSpan);
      }

      return pill;
    }

    function renderBarCollections(stripEl, hasBookmarksAfter) {
      const visibleCollections = getCollections().filter((c) => !c.hidden);
      const highlightedId = activeViewColId || activeEditColId;

      visibleCollections.forEach((col) => {
        const pill = createCollectionPillVisual(col, { interactiveOnBar: true });
        pill.setAttribute("role", "button");
        pill.tabIndex = 0;

        if (highlightedId && highlightedId !== col.id) {
          pill.classList.add("dimmed");
        }

        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          if (Date.now() < suppressClickUntil) return;
          if (inlineRenameState && inlineRenameState.colId === col.id) return;
          openCollectionView(col.id);
        });

        pill.addEventListener("keydown", (e) => {
          if (e.target && e.target.tagName === "INPUT") return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openCollectionView(col.id);
          }
        });

        pill.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof deps.onCollectionContextMenu === "function") {
            deps.onCollectionContextMenu(col, e);
          }
        });

        attachCollectionBarDrag(pill, col);
        stripEl.appendChild(pill);
      });

      // Espaço de criação inline quando ativo (Imagem 1)
      if (creationState) {
        const createPill = document.createElement("div");
        createPill.className = "collection-create-pill";
        createPill.addEventListener("click", (e) => e.stopPropagation());

        const triggerBtn = document.createElement("button");
        triggerBtn.type = "button";
        triggerBtn.className = "create-emoji-trigger";
        triggerBtn.title = "Definir cor e emoji";
        triggerBtn.textContent =
          creationState.emojiTouched && creationState.emoji ? creationState.emoji : "[+]";

        triggerBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!creationState) return;
          creationState.showStyleControls = !creationState.showStyleControls;
          renderFloatingCreationControls();
        });

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "create-name-input";
        nameInput.placeholder = "Minha coleção...";
        nameInput.maxLength = 60;
        nameInput.value = creationState.name;

        nameInput.addEventListener("input", () => {
          if (creationState) {
            creationState.name = nameInput.value;
          }
        });

        nameInput.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finalizeCreation({ openEditorAfter: true, allowEmptyCancel: false });
          } else if (e.key === "Escape") {
            e.preventDefault();
            creationState = null;
            floatingStyleBar.classList.remove("open");
            floatingStyleBar.textContent = "";
            closeEmojiPopover();
            reRenderBar();
            notifyOverlayState();
          }
        });

        creationState.inputEl = nameInput;
        creationState.triggerBtnEl = triggerBtn;

        createPill.appendChild(triggerBtn);
        createPill.appendChild(nameInput);
        stripEl.appendChild(createPill);

        if (creationState.showStyleControls) {
          requestAnimationFrame(renderFloatingCreationControls);
        }
      }

      if ((visibleCollections.length > 0 || creationState) && hasBookmarksAfter) {
        const spacer = document.createElement("span");
        spacer.className = "collections-bar-gap";
        stripEl.appendChild(spacer);
      }
    }

    // ============================================================================
    // MENU DE COLEÇÕES (SUBMENU EM MAIS OPÇÕES & MENU AVULSO DO BOTÃO DIREITO)
    // ============================================================================
    function openItemActionsDropdown(anchorBtn, col, refreshMenuContentFn, parentSubmenuRow) {
      if (activeActionsColId === col.id && itemActionsMenu.classList.contains("open")) {
        closeItemActionsMenu();
        return;
      }

      closeItemActionsMenu();
      activeActionsColId = col.id;
      anchorBtn.classList.add("active");

      if (parentSubmenuRow) {
        pinnedSubmenuRow = parentSubmenuRow;
        pinnedSubmenuRow.classList.add("open");
      }

      // Opção 1: Editar
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "menu-row";
      editBtn.textContent = "Editar";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeItemActionsMenu();
        closeHostMenus();
        standaloneMenu.classList.remove("open");
        isStandaloneMenuOpen = false;
        openCollectionEditor(col.id);
      });

      // Opção 2: Ocultar / Mostrar
      const toggleHideBtn = document.createElement("button");
      toggleHideBtn.type = "button";
      toggleHideBtn.className = "menu-row";
      toggleHideBtn.textContent = col.hidden ? "Mostrar na barra" : "Ocultar";
      toggleHideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nextHidden = !col.hidden;
        const updated = getCollections().map((c) => (c.id === col.id ? { ...c, hidden: nextHidden } : c));
        if (nextHidden && (activeViewColId === col.id || activeEditColId === col.id)) {
          activeViewColId = null;
          activeEditColId = null;
          viewCard.classList.remove("open");
          editorPanel.classList.remove("open");
        }
        closeItemActionsMenu();
        saveSetting({ collections: updated }, () => {
          reRenderBar();
          refreshMenuContentFn();
        });
      });

      // Opção 3: Apagar (em vermelho com confirmação no próprio botão)
      let armedDelete = false;
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "menu-row danger-row";
      deleteBtn.textContent = "Apagar";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!armedDelete) {
          armedDelete = true;
          deleteBtn.classList.add("confirming");
          deleteBtn.textContent = "Aperte para confirmar";
          return;
        }
        const remaining = getCollections().filter((c) => c.id !== col.id);
        if (activeViewColId === col.id || activeEditColId === col.id) {
          activeViewColId = null;
          activeEditColId = null;
          viewCard.classList.remove("open");
          editorPanel.classList.remove("open");
        }
        closeItemActionsMenu();
        saveSetting({ collections: remaining }, () => {
          reRenderBar();
          refreshMenuContentFn();
        });
      });

      itemActionsMenu.appendChild(editBtn);
      itemActionsMenu.appendChild(toggleHideBtn);
      itemActionsMenu.appendChild(deleteBtn);

      const rect = anchorBtn.getBoundingClientRect();
      const menuW = 176;
      const menuH = 106;
      let left = rect.right - menuW;
      if (left < 8) left = rect.left;
      left = Math.min(left, window.innerWidth - menuW - 8);

      let top = rect.bottom + 4;
      if (top + menuH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuH - 4);
      }

      itemActionsMenu.style.left = `${left}px`;
      itemActionsMenu.style.top = `${top}px`;
      itemActionsMenu.classList.add("open");
    }

    function renderCollectionsMenuContent(containerEl, parentSubmenuRow = null) {
      containerEl.textContent = "";

      const desc = document.createElement("div");
      desc.className = "col-menu-desc";
      desc.textContent =
        "Organize sua barra de favoritos com coleções. Adicione os sites salvos nos seus favoritos, escolha um nome, cor e emoji. As coleções ficam salvas apenas no My New Tab e não interferem nos favoritos do navegador.";
      containerEl.appendChild(desc);

      const divTop = document.createElement("div");
      divTop.className = "menu-divider";
      containerEl.appendChild(divTop);

      const cols = getCollections();
      if (cols.length > 0) {
        const listEl = document.createElement("div");
        listEl.className = "col-menu-list";

        cols.forEach((col) => {
          const row = document.createElement("div");
          row.className = "col-menu-item-row" + (col.hidden ? " is-hidden" : "");

          const pillPreview = createCollectionPillVisual(col, { interactiveOnBar: false });
          pillPreview.title = col.hidden ? "Coleção oculta na barra (clique para editar)" : "Editar coleção";
          pillPreview.addEventListener("click", (e) => {
            e.stopPropagation();
            closeItemActionsMenu();
            closeHostMenus();
            standaloneMenu.classList.remove("open");
            isStandaloneMenuOpen = false;
            openCollectionEditor(col.id);
          });

          const dotsBtn = document.createElement("button");
          dotsBtn.type = "button";
          dotsBtn.className = "col-dots-btn";
          dotsBtn.title = "Opções da coleção";
          dotsBtn.innerHTML = COL_ICONS.dots;
          dotsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openItemActionsDropdown(
              dotsBtn,
              col,
              () => renderCollectionsMenuContent(containerEl, parentSubmenuRow),
              parentSubmenuRow
            );
          });

          row.appendChild(pillPreview);
          row.appendChild(dotsBtn);
          listEl.appendChild(row);
        });

        containerEl.appendChild(listEl);

        const divBottom = document.createElement("div");
        divBottom.className = "menu-divider";
        containerEl.appendChild(divBottom);
      }

      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "menu-row";

      const leftWrap = document.createElement("div");
      leftWrap.className = "menu-row-left";

      const iconSlot = document.createElement("span");
      iconSlot.className = "check-slot";
      iconSlot.innerHTML = COL_ICONS.addCollection;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = "Criar coleção";

      leftWrap.appendChild(iconSlot);
      leftWrap.appendChild(labelSpan);
      createBtn.appendChild(leftWrap);

      createBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeItemActionsMenu();
        closeHostMenus();
        standaloneMenu.classList.remove("open");
        isStandaloneMenuOpen = false;
        startCreatingCollection();
      });

      containerEl.appendChild(createBtn);
    }

    function createSettingsSubmenuRow(chevronSvg) {
      const row = document.createElement("div");
      row.className = "menu-row has-submenu";

      const left = document.createElement("div");
      left.className = "menu-row-left";

      const slot = document.createElement("span");
      slot.className = "check-slot";

      const label = document.createElement("span");
      label.textContent = "Coleções";

      left.appendChild(slot);
      left.appendChild(label);
      row.appendChild(left);

      const arrowWrap = document.createElement("span");
      arrowWrap.style.display = "inline-flex";
      arrowWrap.innerHTML = chevronSvg;
      row.appendChild(arrowWrap);

      const submenu = document.createElement("div");
      submenu.className = "submenu collections-submenu";
      renderCollectionsMenuContent(submenu, row);

      row.appendChild(submenu);
      return row;
    }

    function openStandaloneCollectionsMenu(clientX, clientY) {
      closeHostMenus();
      closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true, skipBarRender: true });

      renderCollectionsMenuContent(standaloneMenu, null);
      const menuW = 286;
      const left = Math.max(8, Math.min(clientX, window.innerWidth - menuW - 8));
      const top = Math.max(35, Math.min(clientY, window.innerHeight - 280));

      standaloneMenu.style.left = `${left}px`;
      standaloneMenu.style.top = `${top}px`;
      standaloneMenu.classList.add("open");
      isStandaloneMenuOpen = true;
      notifyOverlayState();
    }

    // ============================================================================
    // MENUS DE CONTEXTO (BOTÃO DIREITO NA BARRA VS BOTÃO DIREITO NA COLEÇÃO)
    // ============================================================================
    function createBarContextMenuItems(anchorX) {
      const createRow = document.createElement("button");
      createRow.type = "button";
      createRow.className = "menu-row";
      createRow.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.addCollection}</span>
          <span>Criar coleção</span>
        </div>
      `;
      createRow.addEventListener("click", (e) => {
        e.stopPropagation();
        closeHostMenus();
        startCreatingCollection();
      });

      const menuRow = document.createElement("button");
      menuRow.type = "button";
      menuRow.className = "menu-row";
      menuRow.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.collections}</span>
          <span>Menu coleções</span>
        </div>
      `;
      menuRow.addEventListener("click", (e) => {
        e.stopPropagation();
        openStandaloneCollectionsMenu(anchorX, 35);
      });

      return [createRow, menuRow];
    }

    function renderCollectionContextMenu(contextMenuEl, col, clientX) {
      contextMenuEl.textContent = "";

      const editColBtn = document.createElement("button");
      editColBtn.type = "button";
      editColBtn.className = "menu-row";
      editColBtn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.edit}</span>
          <span>Editar coleção</span>
        </div>
      `;
      editColBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeHostMenus();
        openCollectionEditor(col.id);
      });

      const editNameBtn = document.createElement("button");
      editNameBtn.type = "button";
      editNameBtn.className = "menu-row";
      editNameBtn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.rename}</span>
          <span>Editar nome</span>
        </div>
      `;
      editNameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeHostMenus();
        startInlineRename(col.id, { keepEditorOpen: false });
      });

      const hideBtn = document.createElement("button");
      hideBtn.type = "button";
      hideBtn.className = "menu-row";
      hideBtn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.hide}</span>
          <span>Ocultar</span>
        </div>
      `;
      hideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeHostMenus();
        if (activeViewColId === col.id || activeEditColId === col.id) {
          closeAllCollectionOverlays({ skipBarRender: true });
        }
        const updated = getCollections().map((c) => (c.id === col.id ? { ...c, hidden: true } : c));
        saveSetting({ collections: updated }, () => {
          reRenderSettingsMenu();
        });
        reRenderBar();
      });

      const divider = document.createElement("div");
      divider.className = "menu-divider";

      const colMenuBtn = document.createElement("button");
      colMenuBtn.type = "button";
      colMenuBtn.className = "menu-row";
      colMenuBtn.innerHTML = `
        <div class="menu-row-left">
          <span class="check-slot">${COL_ICONS.collections}</span>
          <span>Menu coleções</span>
        </div>
      `;
      colMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openStandaloneCollectionsMenu(clientX, 35);
      });

      contextMenuEl.appendChild(editColBtn);
      contextMenuEl.appendChild(editNameBtn);
      contextMenuEl.appendChild(hideBtn);
      contextMenuEl.appendChild(divider);
      contextMenuEl.appendChild(colMenuBtn);
    }

    // ============================================================================
    // CLIQUES EXTERNOS, ESCAPE E SINCRONIZAÇÃO ENTRE ABAS
    // ============================================================================
    function handleOutsideInteraction() {
      if (emojiPopover.classList.contains("open")) {
        closeEmojiPopover();
      }
      if (activeActionsColId) {
        closeItemActionsMenu();
      }
      if (inlineRenameState) {
        const keepEditor = inlineRenameState.keepEditorOpen;
        commitInlineRename();
        if (keepEditor && activeEditColId) {
          return;
        }
      }
      if (hasAnyOpenOverlay()) {
        closeAllCollectionOverlays({ commitPendingCreation: true, commitPendingRename: true });
      }
    }

    const onShadowPointerDownCapture = (e) => {
      const target = e.target;
      if (!target) return;

      if (emojiPopover.classList.contains("open") && !emojiPopover.contains(target)) {
        const isEmojiBtn = target.closest && target.closest(".col-emoji-swatch");
        if (!isEmojiBtn) closeEmojiPopover();
      }

      if (activeActionsColId && !itemActionsMenu.contains(target)) {
        const isDots = target.closest && target.closest(".col-dots-btn");
        if (!isDots) closeItemActionsMenu();
      }
    };

    const onSettingsMenuPointerOver = (e) => {
      if (!pinnedSubmenuRow || !deps.settingsMenu) return;
      const target = e.target;
      if (!target || !target.closest) return;
      const topRow = target.closest(".fluent-menu > .menu-row");
      if (topRow && topRow !== pinnedSubmenuRow) {
        closeItemActionsMenu();
      }
    };

    const onShadowClick = (e) => {
      const target = e.target;
      if (!target) return;

      // Clique em área vazia da própria barra finaliza/cancela criação ou fecha coleções abertas
      const clickedInsideProtected =
        target.closest &&
        target.closest(
          ".collection-create-pill, .collection-pill, .col-floating-style-bar, .col-editor-panel, .col-view-card, .col-emoji-popover, .fluent-menu"
        );
      if (!clickedInsideProtected && hasAnyOpenOverlay()) {
        handleOutsideInteraction();
      }
    };

    const onWindowKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (emojiPopover.classList.contains("open")) {
        closeEmojiPopover();
        return;
      }
      if (activeActionsColId) {
        closeItemActionsMenu();
        return;
      }
      if (creationState) {
        closeAllCollectionOverlays({ commitPendingCreation: false });
        return;
      }
      if (inlineRenameState) {
        inlineRenameState = null;
        reRenderBar();
        notifyOverlayState();
        return;
      }
      if (hasAnyOpenOverlay()) {
        closeAllCollectionOverlays();
      }
    };

    const onWindowResize = () => {
      if (activeEditColId) repositionEditorToPill(activeEditColId);
      if (activeViewColId) {
        const col = findCollection(activeViewColId);
        if (col) renderViewCardContent(col);
      }
    };

    shadow.addEventListener("pointerdown", onShadowPointerDownCapture, true);
    shadow.addEventListener("click", onShadowClick);
    if (deps.settingsMenu) {
      deps.settingsMenu.addEventListener("pointerover", onSettingsMenuPointerOver);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("resize", onWindowResize, { passive: true });

    function onExternalDataUpdated(options = {}) {
      if (options.bookmarksChanged && activeEditColId) {
        refreshAllBrowserBookmarks();
      }
      if (options.settingsChanged) {
        if (activeEditColId && !findCollection(activeEditColId)) {
          closeAllCollectionOverlays({ skipBarRender: true });
        } else if (activeViewColId) {
          const updatedCol = findCollection(activeViewColId);
          if (!updatedCol || updatedCol.hidden) {
            closeAllCollectionOverlays({ skipBarRender: true });
          } else {
            renderViewCardContent(updatedCol);
          }
        }
        if (!creationState && !inlineRenameState) {
          reRenderBar();
        }
      }
    }

    function destroy() {
      cleanupActiveDrag();
      shadow.removeEventListener("pointerdown", onShadowPointerDownCapture, true);
      shadow.removeEventListener("click", onShadowClick);
      if (deps.settingsMenu) {
        deps.settingsMenu.removeEventListener("pointerover", onSettingsMenuPointerOver);
      }
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("resize", onWindowResize);
    }

    return {
      renderBarCollections,
      attachBookmarkBarDrag,
      startCreatingCollection,
      openCollectionView,
      openCollectionEditor,
      openStandaloneCollectionsMenu,
      createSettingsSubmenuRow,
      createBarContextMenuItems,
      renderCollectionContextMenu,
      closeAllCollectionOverlays,
      closeItemActionsMenu,
      handleOutsideInteraction,
      hasAnyOpenOverlay,
      isActivelyEditing,
      isViewOpen,
      shouldIgnoreOutsideClick: () => Date.now() < suppressClickUntil,
      onExternalDataUpdated,
      destroy
    };
  }

  window.MNT_Collections = {
    getStyles,
    sortBarBookmarks,
    getContrastingTextColor,
    createController
  };
})();
