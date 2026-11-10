(function () {
  "use strict";

  // Limite máximo seguro para colagem sob demanda (5 MB — comporta livros/arquivos extensos sem risco de OOM)
  const MAX_CLIPBOARD_LENGTH = 5242880;
  // Acima de 64 KB, a análise trafega apenas o prefixo (1.5 KB) e só lê o texto integral se o usuário clicar em Colar/Code
  const INLINE_CLIPBOARD_LIMIT = 65536;
  // Janela máxima de caracteres inspecionados para classificação (nunca analisa textos/livros gigantes por inteiro)
  const ANALYSIS_HEAD_LIMIT = 1500;
  // Quantidade máxima de linhas iniciais avaliadas para detectar código-fonte
  const CODE_SAMPLE_MAX_LINES = 18;
  // Limite de palavras do Google (conforme documentação técnica da busca)
  const GOOGLE_MAX_WORDS = 32;

  const AI_ENGINES = new Set(["gemini", "claude", "chatgpt", "perplexity"]);
  const SEARCH_ENGINES = new Set(["google", "duckduckgo", "yahoo", "brave"]);

  // Gera uma assinatura (hash FNV-1a duplo em O(1)) do item copiado sem armazenar o texto original em disco
  function computeClipboardHash(text) {
    if (typeof text !== "string" || text.length === 0) return "";
    const len = text.length;
    const head = text.slice(0, 512);
    const tail = len > 512 ? text.slice(-256) : "";
    const sample = `${len}:${head}:${tail}`;

    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code ^ (i & 0xff);
      h2 = Math.imul(h2, 0x811c9dc5);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
    const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
    return `${hex1}${hex2}:${len}`;
  }

  // ============================================================================
  // CONTEXTO 1: DOCUMENTO OFFSCREEN (Leitura isolada, silenciosa e sem roubo de foco)
  // ============================================================================
  const sandboxEl = typeof document !== "undefined" ? document.getElementById("mnt-clipboard-sandbox") : null;
  if (sandboxEl && (window.location.protocol === "chrome-extension:" || window.location.protocol === "extension:")) {
    let lastQuickLength = -1;
    let lastQuickPrefix = "";
    let lastQuickHash = "";

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id || !request || request.target !== "mnt-offscreen-clipboard") {
        return false;
      }

      if (request.action === "readClipboardSlice") {
        try {
          sandboxEl.value = "";
          sandboxEl.focus();
          const ok = document.execCommand("paste");
          const raw = ok ? sandboxEl.value : "";
          // Limpa imediatamente o DOM do offscreen para não reter memória
          sandboxEl.value = "";

          if (!raw || typeof raw !== "string") {
            sendResponse({ ok: true, empty: true });
            return false;
          }

          const totalLength = raw.length;
          if (totalLength === 0) {
            sendResponse({ ok: true, empty: true });
            return false;
          }

          const prefix = raw.slice(0, 128);
          if (
            totalLength === lastQuickLength &&
            prefix === lastQuickPrefix &&
            lastQuickHash &&
            request.knownHash === lastQuickHash
          ) {
            sendResponse({
              ok: true,
              unchanged: true,
              alreadyAnalyzed: true,
              hash: lastQuickHash,
              totalLength
            });
            return false;
          }

          const hash = computeClipboardHash(raw);
          lastQuickLength = totalLength;
          lastQuickPrefix = prefix;
          lastQuickHash = hash;

          if (totalLength > MAX_CLIPBOARD_LENGTH) {
            sendResponse({
              ok: true,
              tooLarge: true,
              hash,
              totalLength
            });
            return false;
          }

          const trimmedCheck = prefix.trim();
          if (!trimmedCheck && !raw.slice(0, ANALYSIS_HEAD_LIMIT).trim()) {
            sendResponse({ ok: true, empty: true });
            return false;
          }

          // Textos muito grandes (> 64 KB): envia apenas o recorte inicial (1.5 KB) para classificação instantânea
          if (totalLength > INLINE_CLIPBOARD_LIMIT) {
            sendResponse({
              ok: true,
              headText: raw.slice(0, ANALYSIS_HEAD_LIMIT),
              deferredFull: true,
              totalLength,
              hash
            });
            return false;
          }

          sendResponse({
            ok: true,
            text: raw,
            totalLength,
            hash
          });
        } catch (err) {
          sandboxEl.value = "";
          sendResponse({ ok: false });
        }
        return false;
      }

      if (request.action === "readClipboardFull") {
        try {
          sandboxEl.value = "";
          sandboxEl.focus();
          const ok = document.execCommand("paste");
          const raw = ok ? sandboxEl.value : "";
          sandboxEl.value = "";

          if (!raw || typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CLIPBOARD_LENGTH) {
            sendResponse({ ok: false });
            return false;
          }

          if (request.expectedHash) {
            const currentHash = computeClipboardHash(raw);
            if (currentHash !== request.expectedHash) {
              sendResponse({ ok: false });
              return false;
            }
          }

          sendResponse({
            ok: true,
            text: raw.trim()
          });
        } catch (err) {
          sandboxEl.value = "";
          sendResponse({ ok: false });
        }
        return false;
      }

      return false;
    });

    return;
  }

  // ============================================================================
  // CONTEXTO 2: CONTENT SCRIPT (Análise Inteligente, Classificação e Colagem Segura)
  // ============================================================================
  if (window.top !== window.self) return;

  const KNOWN_TLDS = new Set([
    "com", "br", "org", "net", "io", "ai", "dev", "app", "gov", "edu", "jus",
    "co", "me", "tv", "gg", "tech", "info", "xyz", "store", "online", "cloud",
    "pt", "es", "uk", "de", "fr", "us", "ca", "ar", "cl", "mx", "uy", "it", "nl"
  ]);

  const CODE_FILE_EXTENSIONS = new Set([
    "js", "ts", "jsx", "tsx", "py", "rb", "java", "c", "cpp", "h", "cs", "go",
    "rs", "php", "swift", "kt", "sql", "json", "xml", "yaml", "yml", "toml",
    "ini", "cfg", "txt", "md", "csv", "log", "sh", "bat", "ps1", "exe", "dll",
    "png", "jpg", "jpeg", "gif", "svg", "webp", "mp4", "mp3", "pdf", "zip", "rar"
  ]);

  const CODE_OBJECTS_BLACKLIST = new Set([
    "console", "window", "document", "math", "json", "object", "array", "string",
    "number", "boolean", "promise", "process", "system", "std", "self", "this",
    "super", "chrome", "navigator", "location", "history", "localstorage", "sessionstorage",
    "os", "sys", "path", "fs", "http", "https", "req", "res", "err", "event", "el", "ui"
  ]);

  function formatSingleLinePreview(str, maxChars = 36) {
    const clean = String(str || "").replace(/\s+/g, " ").trim();
    const isOverflowing = clean.length > maxChars;
    const preview = isOverflowing ? clean.slice(0, maxChars).trimEnd() : clean;
    return { preview, isOverflowing: isOverflowing || clean.length > 22 };
  }

  // Valida e normaliza um candidato a URL web (http/https)
  function validateAndNormalizeUrl(candidate, requireExplicitOrKnownTld) {
    if (typeof candidate !== "string") return null;
    // Remove pontuação final comum quando a URL está dentro de uma frase
    let cleaned = candidate.trim().replace(/[.,;:!?)\]}>"']+$/, "");
    if (cleaned.startsWith("(") || cleaned.startsWith("<") || cleaned.startsWith("[")) {
      cleaned = cleaned.slice(1);
    }
    if (!cleaned || cleaned.length < 4 || cleaned.length > 2000) return null;
    if (/\s/.test(cleaned) || cleaned.includes("@")) return null;

    const hasProtocol = /^https?:\/\//i.test(cleaned);
    const startsWithWww = /^www\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(cleaned);

    const withProtocol = hasProtocol ? cleaned : `https://${cleaned}`;
    let parsed;
    try {
      parsed = new URL(withProtocol);
    } catch (e) {
      return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;

    const parts = host.split(".");
    if (parts.some((p) => !p || !/^[a-z0-9-]+$/i.test(p))) return null;

    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts.length >= 3 ? parts[parts.length - 2] : "";

    // Evita confundir propriedades de código (ex: console.log, window.location, arquivo.txt) com URLs
    if (!hasProtocol && !startsWithWww) {
      if (CODE_OBJECTS_BLACKLIST.has(firstPart)) return null;
      if (parts.length === 2 && CODE_FILE_EXTENSIONS.has(lastPart) && !KNOWN_TLDS.has(lastPart)) {
        return null;
      }
      if (requireExplicitOrKnownTld) {
        const isKnownTld = KNOWN_TLDS.has(lastPart) || (lastPart === "br" && KNOWN_TLDS.has(secondLastPart));
        if (!isKnownTld) return null;
      }
    }

    // Formata versão limpa para exibição na cápsula (ex: www.google.com)
    let display = parsed.host + (parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "") + (parsed.search || "");
    if (display.length > 60) {
      display = display.slice(0, 60);
    }

    return {
      url: parsed.toString(),
      display
    };
  }

  // Detecta URL pura ou contida em um texto curto/médio
  function detectUrlSuggestion(headText) {
    const trimmed = headText.trim();
    if (!trimmed || trimmed.length > 2000) return null;

    // Caso 1: O texto copiado inteiro é uma única URL (com ou sem https://)
    if (!/\s/.test(trimmed)) {
      const direct = validateAndNormalizeUrl(trimmed, true);
      if (direct) {
        const { preview, isOverflowing } = formatSingleLinePreview(direct.display, 34);
        return {
          category: "site",
          label: "Site",
          preview,
          payload: direct.url,
          isOverflowing
        };
      }
    }

    // Caso 2: URL contida dentro de um texto/mensagem curta (até 3 linhas e <= 360 chars)
    if (trimmed.length > 360) return null;
    const lines = trimmed.split(/\r?\n/);
    if (lines.length > 3) return null;

    // Procura primeiro por https:// ou http:// ou www.
    const explicitMatch = trimmed.match(/\b((?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+)/i);
    if (explicitMatch) {
      const found = validateAndNormalizeUrl(explicitMatch[1], false);
      if (found) {
        const { preview, isOverflowing } = formatSingleLinePreview(found.display, 34);
        return {
          category: "site",
          label: "Site",
          preview,
          payload: found.url,
          isOverflowing
        };
      }
    }

    // Procura domínio explícito conhecido em frases curtas (ex: "entra em google.com.br ou github.com/guisilvs")
    const nakedMatch = trimmed.match(/\b([a-zA-Z0-9][a-zA-Z0-9-]{1,61}\.(?:com\.br|org\.br|gov\.br|edu\.br|net\.br|jus\.br|com|org|net|io|ai|dev|app|gov|edu|br)(?:\/[^\s<>"{}|\\^`[\]]*)?)\b/i);
    if (nakedMatch) {
      const found = validateAndNormalizeUrl(nakedMatch[1], true);
      if (found) {
        const { preview, isOverflowing } = formatSingleLinePreview(found.display, 34);
        return {
          category: "site",
          label: "Site",
          preview,
          payload: found.url,
          isOverflowing
        };
      }
    }

    return null;
  }

  // Verifica se uma categoria de sugestão está habilitada nas preferências do usuário
  function isCategoryEnabled(category, settings) {
    if (!settings || settings.clipboardAllCategories !== false) {
      return true;
    }
    const cats = settings.clipboardCategories;
    if (!cats || typeof cats !== "object") {
      return true;
    }
    return cats[category] !== false;
  }

  function getLineIndentWidth(line) {
    let count = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === " ") count += 1;
      else if (ch === "\t") count += 4;
      else break;
    }
    return count;
  }

  // Analisa APENAS as primeiras linhas do texto para identificar código-fonte com alta assertividade e custo O(1)
  function detectCodeInHead(rawNonEmptyLines) {
    if (!Array.isArray(rawNonEmptyLines) || rawNonEmptyLines.length === 0) return false;
    const sampleRawLines = rawNonEmptyLines.slice(0, CODE_SAMPLE_MAX_LINES);
    const sample = sampleRawLines.join("\n").slice(0, 1200);
    if (!sample) return false;

    const trimmedLines = sampleRawLines.map((l) => l.trim());
    const firstTrimmed = trimmedLines[0] || "";

    // URL única pura nunca deve ser classificada como código (mesmo que contenha ?a=1&b=2)
    if (trimmedLines.length === 1 && /^(?:https?:\/\/|www\.)\S+$/i.test(firstTrimmed)) {
      return false;
    }

    let score = 0;

    // 1. HTML / XML / SVG / JSX / Web Components
    if (
      /^\s*<!DOCTYPE\s+html\b/i.test(sample) ||
      /<([a-zA-Z][\w:-]*)\b[^>]*>[\s\S]*<\/\1\s*>/.test(sample) ||
      /<([a-zA-Z][\w:-]*)\b(?!:)[^>\n]*\/>/.test(sample) ||
      /(?:^|\n)\s*<(?:html|head|body|div|span|p|a|h[1-6]|script|style|link|meta|section|article|aside|main|header|footer|nav|form|label|input|textarea|select|option|button|svg|path|g|circle|rect|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|th|td|img|video|audio|canvas|iframe|template|slot|figure|figcaption|details|summary|dialog|code|pre)\b(?:\s+[^>\n]*)?>/i.test(sample) ||
      /(?:^|\n)\s*<[A-Z][A-Za-z0-9]+\b(?:\s+[a-zA-Z_:][\w:.-]*(?:=(?:"[^"]*"|'[^']*'|\{[^}]*\}))?)*\s*\/?>/.test(sample)
    ) {
      score += 3;
    }

    // 2. SQL (DML, DDL, CTEs e fragmentos multi-cláusula, ignorando comentários iniciais -- ou /* */)
    const sqlClean = sample.replace(/^\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)+/, "");
    const looksLikeEnglishProseSelect =
      /^SELECT\s+(?:the|a|an|your|our|this|that|these|those|any|one|all\s+the)\b/i.test(sqlClean) ||
      /\bFROM\s+(?:the|a|an|your|our|this|that|these|those)\b/i.test(sqlClean) ||
      /^UPDATE\s+(?:the|a|an|your|our|this|that)\b/i.test(sqlClean);

    if (
      !looksLikeEnglishProseSelect &&
      /^(?:WITH\s+[a-zA-Z_]\w*\s+AS\s*\(|SELECT\s+[\s\S]{1,240}?\bFROM\s+[a-zA-Z_`"\[]|SELECT\s+(?:DISTINCT\s+|TOP\s+\d+\s+)?[\w*(),\s.'"+-]+\s*;|INSERT\s+(?:IGNORE\s+|OR\s+REPLACE\s+)?INTO\s+[a-zA-Z_`"\[]\S*|UPDATE\s+[a-zA-Z_`"\[]\S*\s+SET\s+[a-zA-Z_`"\[]|DELETE\s+FROM\s+[a-zA-Z_`"\[]\S*|MERGE\s+INTO\s+\S+|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+|UNIQUE\s+)?(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE)\b|ALTER\s+(?:TABLE|VIEW|DATABASE|SCHEMA|INDEX)\b|DROP\s+(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER)\b|TRUNCATE\s+TABLE\b)/i.test(sqlClean)
    ) {
      score += 3;
    } else if (!looksLikeEnglishProseSelect) {
      let sqlClauses = 0;
      if (/\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+[a-zA-Z_`"\[]\S*\s+ON\b/i.test(sqlClean)) sqlClauses++;
      if (/\bWHERE\s+\S+\s*(?:=|<|>|!=|<>|\bIN\b|\bLIKE\b|\bILIKE\b|\bIS\b|\bBETWEEN\b)/i.test(sqlClean)) sqlClauses++;
      if (/\bGROUP\s+BY\s+[a-zA-Z_0-9`"(\[]/i.test(sqlClean)) sqlClauses++;
      if (/\bORDER\s+BY\s+[a-zA-Z_0-9`"(\[]/i.test(sqlClean)) sqlClauses++;
      if (/\bHAVING\s+\S+/i.test(sqlClean)) sqlClauses++;
      if (/\bVALUES\s*\(/i.test(sqlClean)) sqlClauses++;
      if (sqlClauses >= 2) score += 3;
    }

    // 3. CSS / SCSS / Regras de estilo e declarações copiadas do DevTools
    if (
      /(?:^|\n)\s*(?:@(?:media|keyframes|supports|layer|container|font-face|import)\b|[.#*:&\[]?[a-zA-Z0-9_-][^{\n]{0,120}\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:--[a-zA-Z0-9_-]+|[a-z]{2,}(?:-[a-z]+)*)\s*:\s*[^;{}\n]+)/m.test(sample)
    ) {
      score += 3;
    } else {
      const cssPropRegex = /^\s*(?:--[a-zA-Z0-9_-]+|(?:display|position|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-[a-z]+)*|background(?:-[a-z]+)*|color|font(?:-[a-z]+)*|line-height|letter-spacing|text-(?:align|decoration|transform|overflow)|flex(?:-[a-z]+)*|grid(?:-[a-z]+)*|align-items|justify-content|gap|opacity|z-index|overflow(?:-[xy])?|box-shadow|transform|transition|animation|cursor|pointer-events|user-select|backdrop-filter))\s*:\s*[^;\n]+;\s*$/;
      const cssPropLines = trimmedLines.filter((l) => cssPropRegex.test(l));
      if (
        cssPropLines.length >= 2 ||
        (cssPropLines.length === 1 &&
          /(?:\b\d+(?:px|rem|em|vh|vw|%|s|ms)\b|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|var\(--|calc\(|linear-gradient\()/i.test(cssPropLines[0]))
      ) {
        score += 3;
      }
    }

    // 4. Python (def, class, imports, compreensões, decorators e blocos com ':' + indentação)
    if (
      /^\s*(?:async\s+)?def\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*(?:->\s*[^:\n]+)?\s*:/m.test(sample) ||
      /^\s*class\s+[A-Z_]\w*(?:\([^)]*\))?\s*:/m.test(sample) ||
      /^\s*from\s+[a-z_.][\w.]*\s+import\s+[a-zA-Z_*(\w]/m.test(sample) ||
      /^\s*import\s+[a-z_][\w.]*(?:\s+as\s+[a-zA-Z_]\w*)?\s*$/m.test(sample) ||
      /\[[^\n\]]+\bfor\s+[a-zA-Z_]\w*\s+in\s+[^\n\]]+\]/.test(sample) ||
      /\bif\s+__name__\s*==\s*['"]__main__['"]/.test(sample)
    ) {
      score += 3;
    } else {
      for (let i = 0; i < sampleRawLines.length - 1; i++) {
        const curTrim = trimmedLines[i];
        if (/^(?:if|elif|else|for|while|with|try|except|finally|match|case)\b[^;\n]*:\s*(?:#.*)?$/.test(curTrim)) {
          if (getLineIndentWidth(sampleRawLines[i + 1]) > getLineIndentWidth(sampleRawLines[i])) {
            score += 3;
            break;
          }
        }
      }
    }

    // 5. Go (func, package, :=, struct/interface, err != nil)
    if (
      /^\s*func\s+(?:\([^)]+\)\s*)?[a-zA-Z_]\w*\s*\(/m.test(sample) ||
      /^\s*package\s+[a-z_]\w*\s*$/m.test(sample) ||
      /\b[a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*\s*:=\s*[^=\s]/.test(sample) ||
      /\bif\s+err\s*!=\s*nil\b/.test(sample) ||
      /\btype\s+[A-Z]\w*\s+(?:struct|interface)\s*\{/.test(sample)
    ) {
      score += 3;
    }

    // 6. Java / C# / Kotlin / C / C++ / Rust (modificadores, generics, anotações, macros e pré-processador)
    if (
      /^\s*(?:public|private|protected|internal)\s+(?:static\s+|final\s+|abstract\s+|readonly\s+|override\s+|virtual\s+|async\s+|synchronized\s+)*(?:class\s+|interface\s+|enum\s+|record\s+|struct\s+|void\s+|[a-zA-Z_][\w.<>\[\],?\s]*\s+[a-zA-Z_]\w*\s*[=(;{])/m.test(sample) ||
      /^\s*(?:@(?:Override|Autowired|Bean|Component|Service|Repository|Controller|RestController|RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|Entity|Table|Id|Column|Test|BeforeEach|AfterEach|Nullable|NonNull|SuppressWarnings|Data|Builder|Getter|Setter)\b|#\[(?:derive|allow|cfg|test)\b|\[(?:Serializable|HttpGet|HttpPost|Route|ApiController)\])/m.test(sample) ||
      /\b[A-Z]\w*<\s*[A-Z?][\w<>,\s?]*>\s+[a-zA-Z_]\w*\s*[=;(]/.test(sample) ||
      /\bnew\s+[A-Z]\w*(?:<[^>]*>)?\s*\(/.test(sample) ||
      /^\s*#(?:include\s*[<"][^>"]+[>"]|define\s+[A-Za-z_]\w*|ifdef\s+\w+|ifndef\s+\w+|pragma\s+\w+)/m.test(sample) ||
      /\b(?:fn\s+[a-z_]\w*\s*[<(]|let\s+mut\s+[a-z_]\w*|impl(?:\s*<[^>]+>)?\s+[A-Z]\w*|println!\s*\(|std::\w+)/.test(sample)
    ) {
      score += 3;
    }

    // 7. JavaScript / TypeScript / PHP / JSON / CLI / Shell
    if (
      /^\s*(?:export\s+)?(?:const|let|var)\s+(?:[a-zA-Z_$][\w$]*|\{[^}]+\}|\[[^\]]+\])\s*(?::\s*[^=\n]+)?=/m.test(sample) ||
      /^\s*(?:import\s+(?:type\s+)?[\w*{}\s,]+\s+from\s+['"][^'"]+['"]|import\s+['"][^'"]+['"]|export\s+(?:default\s+|const\s+|let\s+|var\s+|function\s+|async\s+function\s+|class\s+|interface\s+|type\s+|enum\s+|\{)|(?:module\.)?exports(?:\.[a-zA-Z_$][\w$]*)?\s*=)/m.test(sample) ||
      /(?:\([^()\n]{0,80}\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\{|[\w$(['"`])/.test(sample) ||
      /^\s*(?:export\s+)?(?:interface|type)\s+[A-Z]\w*(?:<[^>]+>)?\s*(?:=|\{)/m.test(sample) ||
      /<\?php\b|\$[a-zA-Z_]\w*\s*(?:=\s*[^;\n]+;|->[a-zA-Z_]\w*)/.test(sample) ||
      /^\s*[\[{]\s*"[^"]+"\s*:/.test(sample) ||
      /^\s*(?:\$\s+)?(?:git\s+(?:clone|commit|push|pull|checkout|status|branch|merge|rebase|init|add|diff|log|stash)|npm\s+(?:install|i|run|start|build|test|ci)|yarn\s+(?:add|run|build|install)|pnpm\s+|pip3?\s+install|python3?\s+-(?:m|c)\s+|docker\s+(?:run|build|compose|ps|exec|pull)|kubectl\s+|cargo\s+(?:build|run|test|add)|go\s+(?:run|build|mod|get|test)|dotnet\s+(?:run|build|add|new)|curl\s+-[a-zA-Z]|sudo\s+apt)\b/m.test(sample)
    ) {
      score += 3;
    }

    if (score >= 3) return true;

    // 8. Heurística generalista multi-linguagem (chamadas de função, atribuições, operadores, APIs e indentação)
    // Chamadas diretas sem espaço antes do '(' (ex: printf(hello world), calcularTotal(a, b), obj.metodo(x))
    if (
      /^\s*[a-zA-Z_$][\w$]*(?:(?:\.|::|->)[a-zA-Z_$][\w$]*)+\s*\([^;\n]*\)\s*;?\s*$/m.test(sample) ||
      /^\s*[a-zA-Z_$][\w$]*\([^)\n]*\)\s*;?\s*$/m.test(sample)
    ) {
      score += 3;
    }

    // APIs e objetos de biblioteca padrão em diversas linguagens
    if (
      /\b(?:console\.(?:log|warn|error|info|table)|document\.(?:getElementById|querySelector|querySelectorAll|createElement|addEventListener)|window\.|System\.out\.print|fmt\.Print|log\.(?:Print|Fatal|Info|Error)|__init__|self\.|this\.[a-zA-Z_$]|super\.|require\(|fetch\(|useState\(|useEffect\(|JSON\.(?:parse|stringify)|Math\.[a-zA-Z]+|Object\.(?:keys|values|entries|assign)|Array\.isArray)\b/.test(sample)
    ) {
      score += 3;
    }

    // Atribuições de variáveis (ex: total = preco * 1.1, x += 1, resultado_final = fn(a))
    const assignmentLines = trimmedLines.filter((l) =>
      /^[a-zA-Z_$@][\w$.[\]]*\s*(?:=|\+=|-=|\*=|\/=|%=|:=|<-|\?\?=|\|\|=|&&=)\s*[^=>\s]/.test(l)
    );
    if (assignmentLines.length >= 2) {
      score += 3;
    } else if (assignmentLines.length === 1) {
      score += 2;
      if (/['"`\d\[\]{}()+\-*/]|true|false|null|None|nil|[a-z]+_[a-z]+|[a-z]+[A-Z]/.test(assignmentLines[0])) {
        score += 1;
      }
    }

    // Contagem de palavras-chave de programação (protegida contra falsos positivos em artigos/livros em inglês)
    const hasCodePunctuation = /[{};=\[\]<>]|[a-zA-Z_$]\w*\(/.test(sample);
    const strictKwMatches = sample.match(
      /\b(?:def|elif|elsif|elseif|fn|func|mut|println|printf|typeof|instanceof|sizeof|nullptr|undefined)\b/g
    );
    if (strictKwMatches) {
      score += strictKwMatches.length >= 2 ? 3 : 2;
    } else if (hasCodePunctuation) {
      const generalKwMatches = sample.match(
        /\b(?:function|const|let|var|val|class|struct|interface|enum|trait|impl|namespace|package|module|import|export|return|yield|async|await|defer|public|private|protected|static|final|void|boolean|bool|int|int32|int64|uint|float|float64|double|String|try|catch|except|finally|throw|None|nil)\b/g
      );
      if (generalKwMatches) {
        const uniqueKws = new Set(generalKwMatches).size;
        score += uniqueKws >= 2 ? 2 : 1;
      }
    }

    // Operadores típicos de linguagens de programação
    if (/(=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|::|->|\+=|-=|\*=|<<|>>|\|>)/.test(sample)) {
      score += 2;
    }

    // Delimitadores estruturais ({ } no fim da linha, ou ; em linhas que não sejam tópicos de lista em texto corrido)
    const codeTerminatedLines = trimmedLines.filter((l) => {
      if (/[{}]\s*$/.test(l)) return true;
      if (!/;\s*$/.test(l)) return false;
      if (/^(?:[-•*–—]|\d+[.)]|[a-zA-Z][)])\s+/.test(l)) return false;
      return /[()={}\[\].<>]|\b(?:return|break|continue|import|package|using|throw)\b/.test(l);
    }).length;
    if (codeTerminatedLines >= 1) score += 1;
    if (codeTerminatedLines >= 2) score += 2;

    if (/[{}\[\]]/.test(sample) && /[`"'=<>]/.test(sample)) {
      score += 1;
    }

    // Comentários de código no início (//, /*, #!/bin/...)
    if (/^\s*(\/\/[^\n]+|\/\*[\s\S]*|#!(?:\/usr)?\/bin\/)/.test(sample)) {
      score += 2;
    }

    // Indentação real preservada em múltiplas linhas combinada com sintaxe estrutural de código
    if (sampleRawLines.length >= 2) {
      const indentedCount = sampleRawLines.filter((l) => getLineIndentWidth(l) >= 2).length;
      if (indentedCount >= 2 && /[{};=<>]|(?:\b[a-zA-Z_$]\w*\()/.test(sample)) {
        score += 2;
      } else if (indentedCount >= 1 && /[{};=\[\]]/.test(sample)) {
        score += 1;
      }
    }

    // Identificadores camelCase ou snake_case combinados com sintaxe estrutural
    if (/(?:\b[a-z]+_[a-z0-9_]+\b|\b[a-z]+[A-Z][a-zA-Z0-9]*\b)/.test(sample) && /[{}();=\[\]]/.test(sample)) {
      score += 1;
    }

    return score >= 3;
  }

  // Detecta endereços físicos puros ou dentro de mensagens (ex: "me encontre aqui na av. marechal castelo branco")
  function detectAddressSuggestion(headText) {
    const trimmed = headText.trim();
    if (!trimmed || trimmed.length < 6 || trimmed.length > 300) return null;

    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 3) return null;

    const singleLine = lines.join(", ");

    // Evita falsos positivos em perguntas informativas (ex: "qual a maior avenida do mundo?", "como limpar a rua")
    if (/^(qual|quais|como|por\s*que|porque|o\s+que|quando|quem|quantos|quantas|existe|onde\s+comprar|significado\s+de)\b/i.test(singleLine)) {
      return null;
    }
    if (/\?$/.test(singleLine) && !/\b(rua|av\.?|avenida|alameda|praça|praca|rodovia|travessa|estrada|cep)\b/i.test(singleLine)) {
      return null;
    }

    // Padrão 1: Logradouros brasileiros / lusófonos (puros ou em frases como "me encontre aqui na av. marechal castelo branco")
    const brStreetRegex = /\b((?:av\.|avenida|rua|r\.|alameda|al\.|travessa|trav\.|praça|praca|pç\.|rodovia|rod\.|estrada|estr\.|marginal|viaduto|largo|quadra|setor|condomínio|condominio)\s+[a-zA-ZÀ-ÿ0-9][a-zA-ZÀ-ÿ0-9\s.,ºª°/-]{2,110})/i;
    const matchBr = singleLine.match(brStreetRegex);

    if (matchBr) {
      let extracted = matchBr[1].trim();

      // Remove sufixos conversacionais caso o endereço esteja no meio de uma frase
      extracted = extracted
        .replace(/\s+(?:às|as|pelas|por\s+volta\s+das)\s+\d{1,2}(?:h\d{0,2}|:\d{2}|\s*horas?)\b.*$/i, "")
        .replace(/\s+(?:esperando\s+você|te\s+espero|me\s+avisa|me\s+liga|qualquer\s+dúvida|perto\s+do\s+mercado|depois\s+da\s+esquina).*$/i, "")
        .replace(/[.;!?]+$/, "")
        .trim();

      // Descarta expressões genéricas que não são nomes de logradouro (ex: "rua de terra", "avenida movimentada", "rua sem saída")
      const genericAfterStreet = /^(?:av\.?|avenida|rua|r\.|estrada|praça|praca)\s+(?:de\s+terra|de\s+pedra|sem\s+saída|sem\s+saida|movimentada|escura|tranquila|principal|do\s+mundo|da\s+cidade|do\s+bairro|perto\s+de\s+mim|mais\s+próxima|mais\s+proxima)\b/i;
      if (!genericAfterStreet.test(extracted)) {
        const afterPrefix = extracted.replace(/^(?:av\.?|avenida|rua|r\.|alameda|al\.|travessa|trav\.|praça|praca|pç\.|rodovia|rod\.|estrada|estr\.|marginal|viaduto|largo|quadra|setor|condomínio|condominio)\s+/i, "").trim();
        const wordsAfter = afterPrefix.split(/\s+/).filter(Boolean);

        // Um endereço válido tem pelo menos 1 nome próprio/substantivo relevante (>= 3 letras) ou número
        if (afterPrefix.length >= 3 && (wordsAfter.length >= 1 && /[a-zA-ZÀ-ÿ]{3,}|\d+/.test(afterPrefix))) {
          const { preview, isOverflowing } = formatSingleLinePreview(extracted, 32);
          return {
            category: "maps",
            label: "Mapa",
            preview,
            payload: extracted,
            isOverflowing
          };
        }
      }
    }

    // Padrão 2: Endereços internacionais (ex: "1600 Amphitheatre Parkway, Mountain View, CA" ou "221B Baker Street, London")
    const intlRegex = /\b(\d{1,6}[A-Za-z]?\s+[A-Z][A-Za-z0-9.\s]{2,45}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Plaza|Parkway|Pkwy\.?|Square|Sq\.?)(?:[,\s]+[A-Za-z.\s]{2,40})?)\b/;
    const matchIntl = singleLine.match(intlRegex);
    if (matchIntl) {
      const extracted = matchIntl[1].replace(/[.;!?]+$/, "").trim();
      const { preview, isOverflowing } = formatSingleLinePreview(extracted, 32);
      return {
        category: "maps",
        label: "Mapa",
        preview,
        payload: extracted,
        isOverflowing
      };
    }

    // Padrão 3: CEP brasileiro acompanhado de localidade/endereço (ex: "01310-100 São Paulo SP")
    if (/^\d{5}-\d{3}\b/.test(singleLine) || (/\bcep\s*:?\s*\d{5}-?\d{3}\b/i.test(singleLine) && singleLine.length <= 120)) {
      const cleanedCep = singleLine.replace(/^.*?\b(cep\s*:?\s*\d{5}-?\d{3}.*)$/i, "$1").trim();
      const { preview, isOverflowing } = formatSingleLinePreview(cleanedCep, 32);
      return {
        category: "maps",
        label: "Mapa",
        preview,
        payload: cleanedCep,
        isOverflowing
      };
    }

    return null;
  }

  // Identifica se um texto tem estrutura exclusiva de comando/prompt para IA (não deve ir para buscador convencional)
  function isAiSpecificPrompt(text, wordCount, paragraphCount) {
    if (paragraphCount > 1) return true;
    if (wordCount > GOOGLE_MAX_WORDS) return true;

    const lower = text.toLowerCase().trim();
    // Comandos diretos típicos de engenharia de prompt para LLMs
    if (/^(atue\s+como|aja\s+como|você\s+é\s+um|voce\s+e\s+um|reescreva|reformula|reformule|melhore\s+este|corrija\s+o\s+seguinte|corrija\s+este|faça\s+um\s+resumo|faca\s+um\s+resumo|resuma\s+o\s+texto|elabore\s+um|crie\s+um\s+roteiro|escreva\s+um\s+e-?mail|escreva\s+uma\s+carta|gere\s+uma?\s+|analise\s+o\s+seguinte|explique\s+passo\s+a\s+passo|traduza\s+o\s+texto|act\s+as\s+a|you\s+are\s+a|rewrite\s+the\s+following|summarize\s+the\s+following)\b/.test(lower)) {
      return true;
    }

    // Textos com múltiplas frases longas (pontuação de período no meio + > 18 palavras) são prompts de IA, não buscas de Google
    const sentenceCount = text.split(/[.!?]+\s+/).filter((s) => s.trim().length > 0).length;
    if (sentenceCount >= 2 && wordCount > 18) {
      return true;
    }

    return false;
  }

  // Função principal de classificação inteligente, rápida e segura
  // Inspeciona APENAS o prefixo (ANALYSIS_HEAD_LIMIT = 1500 chars) + tamanho total, sem varrer livros/textos gigantes por inteiro
  function analyzeClipboardText(rawText, engineId, settings, meta) {
    if (typeof rawText !== "string" || !engineId) return null;
    const totalLength =
      meta && typeof meta.totalLength === "number" && meta.totalLength > 0
        ? meta.totalLength
        : rawText.length;
    if (totalLength === 0 || totalLength > MAX_CLIPBOARD_LENGTH) return null;

    const isDeferred = Boolean(meta && meta.deferredFull);
    const deferredHash = isDeferred && typeof meta.hash === "string" ? meta.hash : "";

    // Recorta apenas o início do texto para inspeção rápida em O(1) (jamais processa um livro/código inteiro)
    const head = rawText.slice(0, ANALYSIS_HEAD_LIMIT);
    const trimmedHead = head.trim();
    if (trimmedHead.length < 2) return null;

    // Preserva a indentação original em rawNonEmptyLines para análise estrutural precisa de código
    const rawAllHeadLines = head.replace(/^\r?\n+/, "").split(/\r?\n/);
    const rawNonEmptyLines = rawAllHeadLines
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.trim().length > 0);
    const nonEmptyLines = rawNonEmptyLines.map((l) => l.trim());
    if (nonEmptyLines.length === 0) return null;

    const isAiEngine = AI_ENGINES.has(engineId);
    const isSearchEngine = SEARCH_ENGINES.has(engineId);
    if (!isAiEngine && !isSearchEngine) return null;

    const looksLikeCode = detectCodeInHead(rawNonEmptyLines);

    // 1. Verifica URL primeiro (URL pura sem espaços ou URL contida em mensagem curta, nunca em textos grandes)
    if (!looksLikeCode) {
      const isSinglePureUrlCandidate = totalLength <= 2000 && nonEmptyLines.length === 1 && !/\s/.test(trimmedHead);
      const isShortMessageWithUrlCandidate = totalLength <= 360 && nonEmptyLines.length <= 3;
      if (isSinglePureUrlCandidate || isShortMessageWithUrlCandidate) {
        const urlCandidateText = isSinglePureUrlCandidate ? rawText.trim() : trimmedHead;
        const urlSuggestion = detectUrlSuggestion(urlCandidateText);
        if (urlSuggestion) {
          return isCategoryEnabled("site", settings) ? [urlSuggestion] : null;
        }
      }
    }

    // 2. Verifica Código-Fonte olhando APENAS as primeiras linhas
    if (looksLikeCode) {
      // Código só é oferecido se o mecanismo selecionado for uma IA e a categoria estiver ativa
      if (!isAiEngine || !isCategoryEnabled("code", settings)) return null;
      const codePreviewSource = nonEmptyLines.slice(0, 3).join(" ");
      const { preview, isOverflowing } = formatSingleLinePreview(codePreviewSource, 32);
      return [
        {
          category: "code",
          label: "Code",
          preview,
          payload: isDeferred ? "" : rawText.trim(),
          deferredFull: isDeferred,
          deferredHash,
          isOverflowing
        }
      ];
    }

    // 3. Verifica Endereço físico (somente quando puro ou dentro de mensagem curta <= 300 caracteres)
    if (totalLength <= 300 && nonEmptyLines.length <= 3) {
      const addressSuggestion = detectAddressSuggestion(trimmedHead);
      if (addressSuggestion) {
        return isCategoryEnabled("maps", settings) ? [addressSuggestion] : null;
      }
    }

    // Contagem de palavras apenas sobre o prefixo inspecionado (custo O(1))
    const headWords = trimmedHead.split(/\s+/).filter(Boolean);
    const headWordCount = headWords.length;
    if (headWordCount === 0) return null;

    // 4. Verifica Palavra Única (pode ser colada/consultada tanto em buscadores quanto em IAs)
    if (totalLength <= 60 && headWordCount === 1 && nonEmptyLines.length === 1) {
      const rawToken = headWords[0];
      // Rejeita tokens com sintaxe de código, caminhos ou URLs antes de limpar pontuação externa
      if (/[./:\\@()[\]{}<>;=_]/.test(rawToken)) {
        return null;
      }
      const word = rawToken.replace(/^["'“”‘’«]+|["'“”‘’.,;:!?»]+$/g, "");
      if (
        word.length >= 2 &&
        word.length <= 45 &&
        /[a-zA-ZÀ-ÿ]/.test(word) &&
        !/\d/.test(word) &&
        !/^[-]+$/.test(word)
      ) {
        const { preview, isOverflowing } = formatSingleLinePreview(word, 24);
        const dualSuggestions = [];
        if (isCategoryEnabled("dict", settings)) {
          dualSuggestions.push({
            category: "dict",
            label: "Dicionário",
            preview,
            payload: word,
            isOverflowing
          });
        }
        if (isCategoryEnabled("colar", settings)) {
          dualSuggestions.push({
            category: "colar",
            label: "Colar",
            preview,
            payload: word,
            isOverflowing
          });
        }
        return dualSuggestions.length > 0 ? dualSuggestions : null;
      }
      return null;
    }

    // 5. Verifica Texto / Pergunta / Prompt / Textos Grandes ("Colar")
    if (!isCategoryEnabled("colar", settings)) {
      return null;
    }

    // Ignora blobs contínuos sem espaços (ex: tokens JWT, hashes gigantes ou base64 puro)
    if (headWordCount < 2 || !/[a-zA-ZÀ-ÿ]/.test(trimmedHead)) {
      return null;
    }

    const headParagraphs = trimmedHead.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);

    if (isSearchEngine) {
      // Buscadores convencionais: somente pesquisas curtas/médias (2 a 32 palavras, 1 parágrafo, <= 220 chars, sem prompts/textos grandes)
      if (
        paragraphCountOrLinesOkForSearch(headParagraphs, nonEmptyLines, totalLength) &&
        headWordCount >= 2 &&
        headWordCount <= GOOGLE_MAX_WORDS &&
        !isAiSpecificPrompt(trimmedHead, headWordCount, headParagraphs.length)
      ) {
        const { preview, isOverflowing } = formatSingleLinePreview(trimmedHead, 34);
        return [
          {
            category: "colar",
            label: "Colar",
            preview,
            payload: trimmedHead,
            isOverflowing
          }
        ];
      }
      return null;
    }

    if (isAiEngine) {
      // Ferramentas de IA: aceita perguntas curtas, prompts elaborados e também textos grandes/artigos/livros
      // compreendidos já nas primeiras linhas (head), sem precisar analisar o texto inteiro
      const { preview, isOverflowing } = formatSingleLinePreview(trimmedHead, 34);
      return [
        {
          category: "colar",
          label: "Colar",
          preview,
          payload: isDeferred ? "" : rawText.trim(),
          deferredFull: isDeferred,
          deferredHash,
          isOverflowing: isOverflowing || totalLength > 34
        }
      ];
    }

    return null;
  }

  function paragraphCountOrLinesOkForSearch(paragraphs, nonEmptyLines, totalLength) {
    return paragraphs.length === 1 && nonEmptyLines.length <= 2 && totalLength <= 220;
  }

  function toDictionarySlug(word) {
    return String(word || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  // Constrói a URL final para sugestões de 'site', 'maps' ou 'dict' respeitando os provedores configurados
  function buildTargetUrl(suggestion, settings) {
    if (!suggestion) return null;

    if (suggestion.category === "site") {
      try {
        const u = new URL(suggestion.payload);
        if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
      } catch (e) {}
      return null;
    }

    if (suggestion.category === "maps") {
      const query = encodeURIComponent(suggestion.payload);
      const provider = settings?.clipboardMapProvider || "google";
      if (provider === "bing") {
        return `https://www.bing.com/maps?q=${query}`;
      }
      if (provider === "apple") {
        return `https://maps.apple.com/?q=${query}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    if (suggestion.category === "dict") {
      const rawWord = String(suggestion.payload || "").trim();
      if (!rawWord) return null;
      const encoded = encodeURIComponent(rawWord);
      const slug = toDictionarySlug(rawWord);
      const provider = settings?.clipboardDictProvider || "dicio";

      if (provider === "sinonimos") {
        return slug
          ? `https://www.sinonimos.com.br/${slug}/`
          : `https://www.sinonimos.com.br/busca.php?q=${encoded}`;
      }
      if (provider === "linguee") {
        return `https://www.linguee.com.br/portugues-ingles/search?source=auto&query=${encoded}`;
      }
      return slug
        ? `https://www.dicio.com.br/${slug}/`
        : `https://www.dicio.com.br/pesquisa.php?q=${encoded}`;
    }

    return null;
  }

  // Localiza a caixa de entrada/pesquisa ativa do buscador ou assistente de IA
  function findEngineInputElement(engineId) {
    const selectorsByEngine = {
      google: ['textarea[name="q"]', 'input[name="q"]'],
      duckduckgo: ['input[name="q"]', "#searchbox_input", "#search_form_input"],
      yahoo: ['input[name="p"]', "#yschsp", 'input[type="search"]'],
      brave: ['input[name="q"]', "#searchbox", 'textarea[name="q"]'],
      chatgpt: [
        "#prompt-textarea",
        'div[contenteditable="true"].ProseMirror',
        'main div[contenteditable="true"]',
        "main textarea"
      ],
      claude: [
        'div[contenteditable="true"].ProseMirror',
        'fieldset div[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]'
      ],
      gemini: [
        'rich-textarea div.ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]'
      ],
      perplexity: [
        "#ask-input",
        'textarea[placeholder]',
        'div[contenteditable="true"][role="textbox"]',
        'main textarea',
        'div[contenteditable="true"]'
      ]
    };

    const candidates = selectorsByEngine[engineId] || [
      'textarea[name="q"]',
      'input[name="q"]',
      'div[contenteditable="true"]',
      "textarea"
    ];

    for (const sel of candidates) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (!el || el.disabled || el.readOnly) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 10) {
          return el;
        }
      }
    }
    return null;
  }

  // Cola o texto na caixa de busca ou IA preservando SEMPRE o conteúdo original já digitado (sem enviar)
  function pasteIntoEngineInput(textToPaste, engineId) {
    if (typeof textToPaste !== "string" || !textToPaste) return false;
    const inputEl = findEngineInputElement(engineId);
    if (!inputEl) return false;

    const tagName = (inputEl.tagName || "").toUpperCase();

    // Caso 1: <input> ou <textarea>
    if (tagName === "INPUT" || tagName === "TEXTAREA") {
      const currentVal = inputEl.value || "";
      const hasExisting = currentVal.trim().length > 0;
      const isMultiLine = tagName === "TEXTAREA" && textToPaste.includes("\n");
      const normalizedPaste = tagName === "INPUT" ? textToPaste.replace(/\s+/g, " ") : textToPaste;

      let separator = "";
      if (hasExisting) {
        if (isMultiLine) {
          separator = currentVal.endsWith("\n") ? "" : "\n";
        } else {
          separator = /\s$/.test(currentVal) ? "" : " ";
        }
      }

      const nextValue = currentVal + separator + normalizedPaste;
      const proto = tagName === "TEXTAREA" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : null;

      if (nativeSetter) {
        nativeSetter.call(inputEl, nextValue);
      } else {
        inputEl.value = nextValue;
      }

      try {
        inputEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (e) {}
      inputEl.focus();
      try {
        inputEl.setSelectionRange(nextValue.length, nextValue.length);
      } catch (e) {}

      inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: normalizedPaste }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // Caso 2: Editores rich-text contenteditable (ChatGPT ProseMirror, Claude, Gemini Quill, Perplexity)
    if (inputEl.isContentEditable || inputEl.getAttribute("contenteditable") === "true") {
      const rawExisting = (inputEl.innerText || inputEl.textContent || "").replace(/\u200B/g, "");
      const hasExisting = rawExisting.trim().length > 0;

      let separator = "";
      if (hasExisting) {
        if (textToPaste.includes("\n")) {
          separator = rawExisting.endsWith("\n\n") ? "" : rawExisting.endsWith("\n") ? "\n" : "\n\n";
        } else {
          separator = /\s$/.test(rawExisting) ? "" : " ";
        }
      }

      const payload = separator + textToPaste;
      try {
        inputEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (e) {}
      inputEl.focus();

      // Posiciona o cursor exatamente ao final do texto já existente para preservar tudo que o usuário escreveu
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      let inserted = false;
      const dispatchSyntheticPaste = (textChunk) => {
        try {
          const dt = new DataTransfer();
          dt.setData("text/plain", textChunk);
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          });
          inputEl.dispatchEvent(pasteEvent);
          return pasteEvent.defaultPrevented;
        } catch (e) {
          return false;
        }
      };

      // Para textos grandes (> 15 KB), prioriza evento sintético de paste nos editores rich-text (ProseMirror/Quill)
      // evitando criar milhares de nós DOM síncronos via insertText, sem perder o texto já digitado
      if (textToPaste.length > 15000) {
        if (separator) {
          try {
            document.execCommand("insertText", false, separator);
          } catch (e) {}
        }
        inserted = dispatchSyntheticPaste(textToPaste);
        if (!inserted) {
          try {
            inserted = document.execCommand("insertText", false, textToPaste);
          } catch (e) {
            inserted = false;
          }
        }
      } else {
        try {
          inserted = document.execCommand("insertText", false, payload);
        } catch (e) {
          inserted = false;
        }
        if (!inserted) {
          inserted = dispatchSyntheticPaste(payload);
        }
      }

      // Posiciona o cursor ao final após a inserção
      const updatedSelection = window.getSelection();
      if (updatedSelection) {
        try {
          const endRange = document.createRange();
          endRange.selectNodeContents(inputEl);
          endRange.collapse(false);
          updatedSelection.removeAllRanges();
          updatedSelection.addRange(endRange);
        } catch (e) {}
      }

      return true;
    }

    return false;
  }

  // Controlador assíncrono do ciclo de vida do Clipboard Inteligente (totalmente inerte quando desativado)
  function createController(options) {
    let isRunning = false;
    let pollIntervalId = null;
    let initTimerId = null;
    let copyTimerId = null;
    let isChecking = false;
    let localLastHash = "";

    const getEngine = options.getEngine;
    const getSettings = options.getSettings;
    const onSuggestion = options.onSuggestion;

    function checkClipboardNow() {
      if (!isRunning || isChecking) return;
      const settings = getSettings();
      if (!settings || !settings.smartClipboard) return;
      if (document.visibilityState !== "visible") return;

      isChecking = true;
      chrome.runtime.sendMessage({ action: "readClipboard" }, (response) => {
        isChecking = false;
        if (chrome.runtime.lastError || !isRunning || !response || !response.ok) {
          return;
        }

        if (response.empty || response.disabled) return;

        const hash = response.hash;
        if (!hash) return;

        // Se já foi analisado nesta aba ou em qualquer outra, ignora imediatamente
        if (response.alreadyAnalyzed || hash === localLastHash || hash === settings.lastClipboardHash) {
          localLastHash = hash;
          return;
        }

        // Marca imediatamente como analisado para nunca sugerir duas vezes o mesmo item
        localLastHash = hash;
        settings.lastClipboardHash = hash;
        chrome.runtime.sendMessage({ action: "markClipboardAnalyzed", hash });

        if (response.tooLarge) return;

        const sourceSample =
          typeof response.text === "string"
            ? response.text
            : typeof response.headText === "string"
              ? response.headText
              : null;
        if (!sourceSample) return;

        const meta = {
          totalLength: typeof response.totalLength === "number" ? response.totalLength : sourceSample.length,
          deferredFull: Boolean(response.deferredFull),
          hash
        };

        const runAnalysis = () => {
          if (!isRunning) return;
          const currentCfg = getSettings();
          if (!currentCfg || !currentCfg.smartClipboard) return;
          const engineId = getEngine();
          const suggestions = analyzeClipboardText(sourceSample, engineId, currentCfg, meta);
          if (suggestions && suggestions.length > 0 && typeof onSuggestion === "function") {
            onSuggestion(suggestions);
          }
        };

        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(runAnalysis, { timeout: 250 });
        } else {
          setTimeout(runAnalysis, 0);
        }
      });
    }

    function onDocumentCopy() {
      if (!isRunning) return;
      clearTimeout(copyTimerId);
      copyTimerId = setTimeout(checkClipboardNow, 80);
    }

    function onWindowFocusOrVisible() {
      if (!isRunning) return;
      if (document.visibilityState === "visible") {
        clearTimeout(copyTimerId);
        copyTimerId = setTimeout(checkClipboardNow, 100);
      }
    }

    function start() {
      if (isRunning) return;
      const settings = getSettings();
      if (!settings || !settings.smartClipboard) return;

      isRunning = true;
      localLastHash = settings.lastClipboardHash || "";

      // Aguarda a barra estabilizar para não impactar em absolutamente nada o tempo de renderização
      initTimerId = setTimeout(checkClipboardNow, 220);

      document.addEventListener("copy", onDocumentCopy, { passive: true });
      document.addEventListener("cut", onDocumentCopy, { passive: true });
      window.addEventListener("focus", onWindowFocusOrVisible, { passive: true });
      document.addEventListener("visibilitychange", onWindowFocusOrVisible, { passive: true });

      // Monitoramento leve somente enquanto a aba está visível para detectar cópias vindas de outros apps
      pollIntervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          checkClipboardNow();
        }
      }, 1800);
    }

    function stop() {
      if (!isRunning) return;
      isRunning = false;
      isChecking = false;
      clearTimeout(initTimerId);
      clearTimeout(copyTimerId);
      clearInterval(pollIntervalId);
      initTimerId = null;
      copyTimerId = null;
      pollIntervalId = null;

      document.removeEventListener("copy", onDocumentCopy);
      document.removeEventListener("cut", onDocumentCopy);
      window.removeEventListener("focus", onWindowFocusOrVisible);
      document.removeEventListener("visibilitychange", onWindowFocusOrVisible);
    }

    function syncWithSettings() {
      const settings = getSettings();
      if (settings && settings.smartClipboard) {
        start();
      } else {
        stop();
      }
    }

    return {
      start,
      stop,
      syncWithSettings,
      checkNow: checkClipboardNow
    };
  }

  window.MNT_SmartClipboard = {
    analyzeClipboardText,
    buildTargetUrl,
    pasteIntoEngineInput,
    createController,
    computeClipboardHash
  };
})();
