const MAP_PROVIDERS = new Set(["yandex", "2gis"]);

function parseAddressMapProvider(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || String(raw).trim() === "") return { value: null };
  const normalized = String(raw).trim().toLowerCase();
  if (!MAP_PROVIDERS.has(normalized)) {
    return { error: "address_map_provider must be yandex or 2gis" };
  }
  return { value: normalized };
}

function parseOptionalCoord(raw, fieldName) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || raw === "") return { value: null };
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { error: `${fieldName} must be a number` };
  }
  return { value: num };
}

function parseShopAddress(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw == null) return { value: null };
  const trimmed = String(raw).replace(/\s+/g, " ").trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > 500) {
    return { error: "shop_address is too long (max 500 characters)" };
  }
  return { value: trimmed };
}

/** Парсит вставку из Конструктора карт → `constructor:<hash>` */
function parseYandexMapConstructorUm(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || String(raw).trim() === "") return { value: null };

  let input = String(raw).trim();
  if (input.length > 4000) {
    return { error: "yandex_map_constructor_um is too long" };
  }

  const umFromUrl = input.match(/[?&]um=([^&"'<>]+)/i);
  if (umFromUrl) {
    try {
      input = decodeURIComponent(umFromUrl[1]);
    } catch {
      input = umFromUrl[1];
    }
  }

  if (/^[a-f0-9]{32,128}$/i.test(input)) {
    input = `constructor:${input}`;
  }

  if (input.startsWith("constructor%3A") || input.startsWith("constructor%3a")) {
    try {
      input = decodeURIComponent(input);
    } catch {
      /* keep */
    }
  }

  if (!/^constructor:[a-f0-9]{32,128}$/i.test(input)) {
    return {
      error:
        "yandex_map_constructor_um must be a constructor embed code from Yandex Map Constructor (script or constructor:…)",
    };
  }

  return { value: input };
}

const DGIS_HOST_RE = /(^|\.)2gis\.(ru|com)$/i;

function isAllowed2gisUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return DGIS_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

function extractBalancedObjectLiteral(source, openBraceIndex) {
  if (source[openBraceIndex] !== "{") return null;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inSingle) {
      if (!escaped && ch === "'") inSingle = false;
      escaped = !escaped && ch === "\\";
      continue;
    }
    if (inDouble) {
      if (!escaped && ch === '"') inDouble = false;
      escaped = !escaped && ch === "\\";
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      escaped = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      escaped = false;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  return null;
}

function findLoaderScriptSrc(input) {
  const scripts = [...input.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
  for (const match of scripts) {
    if (isAllowed2gisUrl(match[1])) return match[1];
  }
  return "https://firmsonmap.api.2gis.ru/js/DGWidgetLoader.js";
}

function validateDgisEmbedObject(obj) {
  if (!obj || typeof obj !== "object" || !obj.kind) {
    return { error: "invalid dgis_map_constructor_embed payload" };
  }
  if (obj.kind === "iframe") {
    if (!obj.src || !isAllowed2gisUrl(String(obj.src))) {
      return { error: "dgis iframe src must be a 2gis URL" };
    }
    return { value: JSON.stringify({ kind: "iframe", src: String(obj.src).trim() }) };
  }
  if (obj.kind === "widget") {
    if (!obj.config || typeof obj.config !== "object") {
      return { error: "dgis widget config is required" };
    }
    const loaderSrc = obj.loaderSrc ? String(obj.loaderSrc).trim() : findLoaderScriptSrc("");
    if (!isAllowed2gisUrl(loaderSrc)) {
      return { error: "dgis widget loader must be a 2gis URL" };
    }
    return {
      value: JSON.stringify({
        kind: "widget",
        loaderSrc,
        config: obj.config,
      }),
    };
  }
  return { error: "dgis_map_constructor_embed kind must be iframe or widget" };
}

/** Парсит код из makemap.2gis.ru → JSON для колонки dgis_map_constructor_embed */
function parseDgisMapConstructorEmbed(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return { value: null };

  if (typeof raw === "object") {
    return validateDgisEmbedObject(raw);
  }

  const input = String(raw).trim();
  if (input.length > 12000) {
    return { error: "dgis_map_constructor_embed is too long" };
  }

  if (input.startsWith("{")) {
    try {
      return validateDgisEmbedObject(JSON.parse(input));
    } catch {
      return { error: "dgis_map_constructor_embed must be valid JSON" };
    }
  }

  const iframeMatch = input.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch && isAllowed2gisUrl(iframeMatch[1])) {
    return {
      value: JSON.stringify({ kind: "iframe", src: iframeMatch[1].trim() }),
    };
  }

  if (isAllowed2gisUrl(input)) {
    return { value: JSON.stringify({ kind: "iframe", src: input }) };
  }

  const loaderSrc = findLoaderScriptSrc(input);

  const widgetIdx = input.search(/new\s+DGWidgetLoader\s*\(/i);
  if (widgetIdx >= 0) {
    const braceAt = input.indexOf("{", widgetIdx);
    const literal = braceAt >= 0 ? extractBalancedObjectLiteral(input, braceAt) : null;
    if (literal) {
      try {
        const config = JSON.parse(literal);
        return validateDgisEmbedObject({ kind: "widget", loaderSrc, config });
      } catch {
        return { error: "could not parse DGWidgetLoader config" };
      }
    }
  }

  const legacyIdx = input.search(/new\s+DG\.Widget\.Components\.Loader\s*\(/i);
  if (legacyIdx >= 0) {
    const braceAt = input.indexOf("{", legacyIdx);
    const literal = braceAt >= 0 ? extractBalancedObjectLiteral(input, braceAt) : null;
    if (literal) {
      try {
        const legacyConfig = JSON.parse(literal);
        const params = legacyConfig.params ?? legacyConfig;
        const resize = params.resize ?? {};
        const map = params.Map ?? {};
        const config = {
          wid: legacyConfig.wid,
          width: String(resize.w ?? resize.width ?? 400),
          height: String(resize.h ?? resize.height ?? 400),
          borderColor: legacyConfig.borderColor ?? "#cccccc",
          pos: {
            lon: String(map.lon ?? ""),
            lat: String(map.lat ?? ""),
            zoom: String(map.zoom ?? 16),
          },
          opt: params.opt ?? { city: params.projectSelector?.code },
          org: params.org,
        };
        return validateDgisEmbedObject({ kind: "widget", loaderSrc, config });
      } catch {
        return { error: "could not parse DG.Widget.Components.Loader config" };
      }
    }
  }

  return {
    error:
      "dgis_map_constructor_embed must be iframe or script code from https://makemap.2gis.ru/",
  };
}

function parseDgisMapConstructorEmbedPublic(stored) {
  if (!stored?.trim()) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed?.kind === "iframe" && isAllowed2gisUrl(parsed.src)) return parsed;
    if (parsed?.kind === "widget" && parsed.config) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseAddressMapUrl(raw) {
  if (raw === undefined) return { value: undefined };
  if (raw == null || String(raw).trim() === "") return { value: null };
  const trimmed = String(raw).trim();
  if (trimmed.length > 2048) {
    return { error: "address_map_url is too long" };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { error: "address_map_url must start with http:// or https://" };
  }
  return { value: trimmed };
}

module.exports = {
  MAP_PROVIDERS,
  parseAddressMapProvider,
  parseOptionalCoord,
  parseShopAddress,
  parseAddressMapUrl,
  parseYandexMapConstructorUm,
  parseDgisMapConstructorEmbed,
  parseDgisMapConstructorEmbedPublic,
};
