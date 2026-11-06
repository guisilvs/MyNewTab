(function () {
  "use strict";

  // Limite máximo absoluto lido do clipboard para evitar consumo excessivo de memória (100 KB)
  const MAX_CLIPBOARD_LENGTH = 102400;
  // Janela máxima de caracteres inspecionados para classificação (nunca analisa textos gigantes por inteiro)
  const ANALYSIS_HEAD_LIMIT = 1500;
  // Quantidade máxima de linhas iniciais avaliadas para detectar código-fonte
  const CODE_SAMPLE_MAX_LINES = 10;
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
          if (!trimmedCheck && !raw.trim()) {
            sendResponse({ ok: true, empty: true });
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
    if (!trimmed || trimmed.length > 600) return null;

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

    // Caso 2: URL contida dentro de um texto/mensagem curta (até 4 linhas)
    const lines = trimmed.split(/\r?\n/);
    if (lines.length > 4) return null;

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

  // Analisa APENAS as primeiras linhas do texto para identificar código-fonte com custo mínimo de CPU/memória
  function detectCodeInHead(nonEmptyLines) {
    const sampleLines = nonEmptyLines.slice(0, CODE_SAMPLE_MAX_LINES);
    const sample = sampleLines.join("\n").slice(0, 700);
    if (!sample) return false;

    let score = 0;

    // Chamadas diretas clássicas em 1 linha: printf(hello world), console.log(...), alert(...), def fn():
    if (/^\s*[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*\s*\([^)]*\)\s*;?\s*$/.test(sampleLines[0])) {
      score += 3;
    }

    // Palavras-chave de declaração de código
    if (/\b(function|const|let|var|class|interface|type|enum|def|elif|async|await|import|export|return|public|private|protected|static|void|int|float|double|boolean|struct|namespace|using|package|impl|fn|pub|mut|println!|printf|sizeof|#include|#define)\b/.test(sample)) {
      score += 2;
    }

    // APIs e objetos de programação comuns
    if (/\b(console\.(log|warn|error|info)|document\.(getElementById|querySelector|createElement|addEventListener)|window\.|System\.out\.print|std::|__init__|self\.|module\.exports|require\(|fetch\(|JSON\.(parse|stringify))\b/.test(sample)) {
      score += 3;
    }

    // Operadores típicos de linguagens de programação
    if (/(=>|===|!==|&&|\|\||::|->|\+=|-=|\*=|<<|>>)/.test(sample)) {
      score += 2;
    }

    // Delimitadores estruturais ({, }, ; no fim da linha, colchetes indexados)
    const linesEndingWithSemiOrBrace = sampleLines.filter((l) => /[;{}]\s*$/.test(l.trim())).length;
    if (linesEndingWithSemiOrBrace >= 1) score += 1;
    if (linesEndingWithSemiOrBrace >= 2) score += 2;

    if (/[{}\[\]();]/.test(sample) && /[`"'=<>]/.test(sample)) {
      score += 1;
    }

    // Tags HTML / JSX / XML
    if (/^\s*<(!DOCTYPE|html|head|body|div|span|p|a|script|style|section|main|header|footer|nav|form|input|button|svg|path|ul|li|table|tr|td|img|[A-Z][A-Za-z0-9]*)\b[^>]*>/i.test(sample)) {
      score += 3;
    }

    // Consultas SQL
    if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(?:TABLE|DATABASE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)\b[\s\S]*\b(FROM|WHERE|VALUES|SET|JOIN|GROUP\s+BY|ORDER\s+BY|\()\b/i.test(sample)) {
      score += 3;
    }

    // Objeto JSON estruturado
    if (/^\s*[\[{]\s*"[^"]+"\s*:/.test(sample)) {
      score += 3;
    }

    // Regra CSS
    if (/^[.#@]?[a-zA-Z0-9_-]+(?:\s+[.#a-zA-Z0-9_:-\[\]]+)*\s*\{\s*[a-z-]+\s*:\s*[^;]+;/m.test(sample)) {
      score += 3;
    }

    // Comandos de terminal / CLI / Git / Docker / NPM / Pip
    if (/^\s*(?:\$\s+)?(?:git\s+(?:clone|commit|push|pull|checkout|status|branch|merge|rebase|init|add)|npm\s+(?:install|i|run|start|build|test)|yarn\s+(?:add|run|build)|pnpm\s+|pip3?\s+install|docker\s+(?:run|build|compose|ps|exec)|kubectl\s+|curl\s+-[a-zA-Z]|sudo\s+apt)\b/.test(sample)) {
      score += 3;
    }

    // Comentários de código no início (//, /*, #!/bin/...)
    if (/^\s*(\/\/[^\n]+|\/\*[\s\S]*|#!(?:\/usr)?\/bin\/)/.test(sample)) {
      score += 2;
    }

    // Indentação característica de blocos de código em múltiplas linhas
    if (sampleLines.length >= 3) {
      const indentedCount = sampleLines.filter((l) => /^(?:  +|\t+)/.test(l)).length;
      if (indentedCount >= 2 && /[{}();=<>:\[\]]/.test(sample)) {
        score += 2;
      }
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
  function analyzeClipboardText(rawText, engineId) {
    if (typeof rawText !== "string" || !engineId) return null;
    const totalLength = rawText.length;
    if (totalLength === 0 || totalLength > MAX_CLIPBOARD_LENGTH) return null;

    // Recorta apenas o início do texto para inspeção rápida (jamais processa um artigo/código inteiro)
    const head = rawText.slice(0, ANALYSIS_HEAD_LIMIT);
    const trimmedHead = head.trim();
    if (trimmedHead.length < 2) return null;

    const allHeadLines = trimmedHead.split(/\r?\n/);
    const nonEmptyLines = allHeadLines.map((l) => l.trim()).filter(Boolean);
    if (nonEmptyLines.length === 0) return null;

    const isAiEngine = AI_ENGINES.has(engineId);
    const isSearchEngine = SEARCH_ENGINES.has(engineId);
    if (!isAiEngine && !isSearchEngine) return null;

    // 1. Verifica URL primeiro (se for um texto curto/médio sem aparência de bloco de código)
    if (totalLength <= 600 && nonEmptyLines.length <= 4 && !detectCodeInHead(nonEmptyLines)) {
      const urlSuggestion = detectUrlSuggestion(trimmedHead);
      if (urlSuggestion) return urlSuggestion;
    }

    // 2. Verifica Código-Fonte olhando APENAS as primeiras linhas
    if (detectCodeInHead(nonEmptyLines)) {
      // Código só é oferecido se o mecanismo selecionado for uma IA
      if (!isAiEngine) return null;
      const codePreviewSource = nonEmptyLines.slice(0, 3).join(" ");
      const { preview, isOverflowing } = formatSingleLinePreview(codePreviewSource, 32);
      return {
        category: "code",
        label: "Code",
        preview,
        payload: rawText.trim(),
        isOverflowing
      };
    }

    // 3. Descarte imediato nas primeiras linhas se for um artigo ou texto muito extenso
    const paragraphs = trimmedHead.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (totalLength > 1100 || paragraphs.length > 3 || nonEmptyLines.length > 9) {
      return null;
    }

    // 4. Verifica Endereço físico (puro ou dentro de mensagem curta)
    if (totalLength <= 300 && nonEmptyLines.length <= 3) {
      const addressSuggestion = detectAddressSuggestion(trimmedHead);
      if (addressSuggestion) return addressSuggestion;
    }

    // Contagem de palavras
    const words = trimmedHead.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount === 0) return null;

    // 5. Verifica Palavra Única ("palavra")
    if (wordCount === 1 && nonEmptyLines.length === 1) {
      const word = words[0];
      // Deve ter entre 2 e 45 caracteres, conter letras e não possuir separadores de domínio/caminho
      if (
        word.length >= 2 &&
        word.length <= 45 &&
        /[a-zA-ZÀ-ÿ]/.test(word) &&
        !/[./:\\@]/.test(word) &&
        !/^[\d.,:;!?@#$%^&*()_+=<>/-]+$/.test(word)
      ) {
        const { preview, isOverflowing } = formatSingleLinePreview(word, 30);
        return {
          category: "palavra",
          label: "Palavra",
          preview,
          payload: word,
          isOverflowing
        };
      }
      return null;
    }

    // 6. Verifica Pergunta / Pesquisa / Prompt ("colar")
    if (isSearchEngine) {
      // Buscadores convencionais: pesquisas curtas/médias (2 a 32 palavras, 1 parágrafo, sem prompts de IA)
      if (
        paragraphCountOrLinesOkForSearch(paragraphs, nonEmptyLines, totalLength) &&
        wordCount >= 2 &&
        wordCount <= GOOGLE_MAX_WORDS &&
        !isAiSpecificPrompt(trimmedHead, wordCount, paragraphs.length)
      ) {
        const { preview, isOverflowing } = formatSingleLinePreview(trimmedHead, 34);
        return {
          category: "colar",
          label: "Colar",
          preview,
          payload: trimmedHead,
          isOverflowing
        };
      }
      return null;
    }

    if (isAiEngine) {
      // IAs: aceita desde pesquisas estilo Google até perguntas/prompts de até 3 parágrafos médios
      const eachParagraphMedium = paragraphs.every((p) => p.length <= 480);
      if (
        paragraphs.length >= 1 &&
        paragraphs.length <= 3 &&
        eachParagraphMedium &&
        wordCount >= 2 &&
        wordCount <= 165 &&
        totalLength <= 1100
      ) {
        const { preview, isOverflowing } = formatSingleLinePreview(trimmedHead, 34);
        return {
          category: "colar",
          label: "Colar",
          preview,
          payload: rawText.trim(),
          isOverflowing
        };
      }
    }

    return null;
  }

  function paragraphCountOrLinesOkForSearch(paragraphs, nonEmptyLines, totalLength) {
    return paragraphs.length === 1 && nonEmptyLines.length <= 2 && totalLength <= 220;
  }

  // Constrói a URL final para sugestões de 'site' ou 'maps' respeitando o provedor de mapas configurado
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
      try {
        inserted = document.execCommand("insertText", false, payload);
      } catch (e) {
        inserted = false;
      }

      if (!inserted) {
        try {
          const dt = new DataTransfer();
          dt.setData("text/plain", payload);
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          });
          inputEl.dispatchEvent(pasteEvent);
          inserted = true;
        } catch (e) {}
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

        if (typeof response.text !== "string") return;

        const runAnalysis = () => {
          if (!isRunning) return;
          const engineId = getEngine();
          const suggestion = analyzeClipboardText(response.text, engineId);
          if (suggestion && typeof onSuggestion === "function") {
            onSuggestion(suggestion);
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
