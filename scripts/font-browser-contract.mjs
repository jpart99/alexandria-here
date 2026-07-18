const FONT_EXTENSION = /\.(?:woff2?|ttf|otf)(?:$|[?#])/iu;
const FONT_DATA_URL = /^data:(?:font\/|application\/(?:font|x-font|vnd\.ms-fontobject))/iu;
const ANY_DATA_URL = /^data:/iu;

function decodeCssEscapes(value) {
  return value
    .replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giu, (_match, hexadecimal) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return codePoint === 0 || codePoint > 0x10FFFF ? "\uFFFD" : String.fromCodePoint(codePoint);
    })
    .replace(/\\(?:\r\n|[\n\f\r])/gu, "")
    .replace(/\\([\s\S])/gu, "$1");
}

function decodePercentEscapes(value) {
  let decoded = value;
  // URL.pathname preserves escaped ASCII, and decodeURIComponent fails the
  // entire value when any malformed escape is present. Decode valid octets
  // independently so one bad escape cannot hide /fonts or a font extension.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decoded.replace(/%([0-9a-f]{2})/giu, (_match, hexadecimal) => (
      String.fromCodePoint(Number.parseInt(hexadecimal, 16))
    ));
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function decodedPathname(url) {
  return decodePercentEscapes(url.pathname);
}

function decodeHtmlEntities(value) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|quot|apos|lt|gt);/giu, (entity, decimal, hexadecimal) => {
    if (decimal || hexadecimal) {
      const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
      return codePoint > 0 && codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : "\uFFFD";
    }
    switch (entity.toLowerCase()) {
      case "&amp;": return "&";
      case "&quot;": return '"';
      case "&apos;": return "'";
      case "&lt;": return "<";
      case "&gt;": return ">";
      default: return entity;
    }
  });
}

function parseAttributes(source) {
  const attributes = new Map();
  for (const match of source.matchAll(/(?:^|\s)([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
    attributes.set(match[1].toLowerCase(), decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function splitLinkHeader(linkHeader) {
  const entries = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let inTarget = false;
  for (let index = 0; index < linkHeader.length; index += 1) {
    const character = linkHeader[index];
    if (escaped) {
      escaped = false;
    } else if (quoted && character === "\\") {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === "<") {
      inTarget = true;
    } else if (!quoted && character === ">") {
      inTarget = false;
    } else if (!quoted && !inTarget && character === ",") {
      entries.push(linkHeader.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(linkHeader.slice(start));
  return entries.filter((entry) => entry.trim().length > 0);
}

function parseLinkHeader(linkHeader) {
  const records = [];
  for (const entry of splitLinkHeader(linkHeader)) {
    const match = entry.match(/^\s*<([^>]*)>([\s\S]*)$/u);
    if (!match) continue;
    const parameters = new Map();
    for (const parameter of match[2].matchAll(/;\s*([A-Za-z][-A-Za-z0-9]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s,]+)))?/gu)) {
      parameters.set(parameter[1].toLowerCase(), parameter[2] ?? parameter[3] ?? parameter[4] ?? "");
    }
    records.push({ href: match[1], attributes: parameters, source: "Link header" });
  }
  return records;
}

function isPhysicalFontPath(pathname) {
  return pathname === "/fonts" || pathname.startsWith("/fonts/");
}

function isFontReference(rawValue, url) {
  const decodedRaw = decodeCssEscapes(rawValue.trim());
  return FONT_DATA_URL.test(decodedRaw)
    || FONT_EXTENSION.test(decodedRaw)
    || FONT_EXTENSION.test(decodedPathname(url))
    || isPhysicalFontPath(decodedPathname(url));
}

function normalizeBrowserUrl(rawValue, baseUrl) {
  const decoded = decodeCssEscapes(rawValue.trim());
  if (ANY_DATA_URL.test(decoded)) return { decoded, url: null };
  return { decoded, url: new URL(decoded, baseUrl) };
}

function inspectFontUrl(rawValue, baseUrl, allowedPaths, source, errors, aliases, { forceFont = false } = {}) {
  let normalized;
  try {
    normalized = normalizeBrowserUrl(rawValue, baseUrl);
  } catch {
    if (forceFont || FONT_EXTENSION.test(decodeCssEscapes(rawValue))) errors.push(`${source} has an invalid font URL.`);
    return;
  }

  if (normalized.url === null) {
    if (forceFont || FONT_DATA_URL.test(normalized.decoded)) {
      errors.push(`${source} embeds a data font instead of an allowed Worker alias.`);
    }
    return;
  }
  if (!forceFont && !isFontReference(normalized.decoded, normalized.url)) return;

  const pathname = decodedPathname(normalized.url);
  if (normalized.url.origin !== baseUrl.origin
    || !allowedPaths.has(normalized.url.pathname)
    || pathname !== normalized.url.pathname
    || normalized.url.search
    || normalized.url.hash) {
    errors.push(`${source} uses unexpected font URL ${normalized.url.href}.`);
    return;
  }
  aliases.add(pathname);
}

function inspectCss(css, stylesheetUrl, allowedPaths, errors, aliases) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, " ");
  const fontFaceMatches = [...withoutComments.matchAll(/@font-face\b[^{}]*\{[\s\S]*?\}/giu)];
  const fontFaceRanges = fontFaceMatches.map((match) => [match.index, match.index + match[0].length]);
  if (fontFaceMatches.some((match) => /\bvar\s*\(/iu.test(match[0]))) {
    errors.push(`CSS at ${stylesheetUrl.pathname} uses unverifiable @font-face variable indirection.`);
  }
  for (const match of withoutComments.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)])*))\s*\)/giu)) {
    const rawValue = match[1] ?? match[2] ?? match[3] ?? "";
    const forceFont = fontFaceRanges.some(([start, end]) => match.index >= start && match.index < end);
    inspectFontUrl(rawValue.trim(), stylesheetUrl, allowedPaths, `CSS at ${stylesheetUrl.pathname}`, errors, aliases, { forceFont });
  }
  for (const match of withoutComments.matchAll(/@import\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/giu)) {
    inspectFontUrl(match[1] ?? match[2] ?? "", stylesheetUrl, allowedPaths, `CSS import at ${stylesheetUrl.pathname}`, errors, aliases);
  }
}

function inspectPreload(record, baseUrl, allowedPaths, errors, aliases, counts) {
  const rel = (record.attributes.get("rel") || "").split(/\s+/u).map((value) => value.toLowerCase());
  if (!rel.includes("preload")) return;

  const as = (record.attributes.get("as") || "").toLowerCase();
  const type = (record.attributes.get("type") || "").toLowerCase();
  let normalized;
  try {
    normalized = normalizeBrowserUrl(record.href || "", baseUrl);
  } catch {
    if (as === "font" || type.startsWith("font/")) errors.push(`${record.source} has an invalid font preload URL.`);
    return;
  }
  const url = normalized.url;
  const fontCandidate = as === "font"
    || type.startsWith("font/")
    || url === null
    || (url && isFontReference(normalized.decoded, url));
  if (!fontCandidate) return;
  if (url === null) {
    errors.push(`${record.source} embeds a data font preload.`);
    return;
  }

  const pathname = decodedPathname(url);
  const crossOriginPresent = record.attributes.has("crossorigin");
  const crossOrigin = (record.attributes.get("crossorigin") || "").toLowerCase();
  if (url.origin !== baseUrl.origin
    || !allowedPaths.has(url.pathname)
    || pathname !== url.pathname
    || url.search
    || url.hash
    || as !== "font"
    || type !== "font/woff2"
    || !crossOriginPresent
    || (crossOrigin !== "" && crossOrigin !== "anonymous")) {
    errors.push(`${record.source} uses an invalid font preload ${url.href}.`);
    return;
  }
  aliases.add(pathname);
  counts.set(pathname, (counts.get(pathname) || 0) + 1);
}

/**
 * @param {{
 *   baseUrl: URL | string;
 *   landingHtml: string;
 *   linkHeader?: string;
 *   stylesheets?: Array<{ url: URL | string; css: string }>;
 *   allowedPublicPaths: string[];
 * }} input
 */
export function auditBrowserFontReferences({
  baseUrl,
  landingHtml,
  linkHeader = "",
  stylesheets = [],
  allowedPublicPaths,
}) {
  const origin = baseUrl instanceof URL ? baseUrl : new URL(baseUrl);
  const allowedPaths = new Set(allowedPublicPaths);
  const errors = [];
  const cssAliases = new Set();
  const preloadAliases = new Set();
  const htmlPreloadCounts = new Map();
  const headerPreloadCounts = new Map();

  // Comments and raw-text/inert containers are not active HTML and must not
  // be able to satisfy the preload contract.
  const activeHtml = landingHtml
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/giu, "$1$2")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/giu, " ");

  const embeddedStyles = [...activeHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/giu)]
    .map((match, index) => ({
      css: match[1],
      url: new URL(`/?font-audit-inline=${index + 1}`, origin),
    }));
  const htmlMarkup = activeHtml.replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/giu, "$1$2");
  const styleAttributes = [...htmlMarkup.matchAll(/<[^>]+>/gu)]
    .map((match) => parseAttributes(match[0]).get("style"))
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((css, index) => ({
      css: `.font-audit-style-attribute { ${css} }`,
      url: new URL(`/?font-audit-style-attribute=${index + 1}`, origin),
    }));

  for (const stylesheet of [...stylesheets, ...embeddedStyles, ...styleAttributes]) {
    inspectCss(stylesheet.css, stylesheet.url instanceof URL ? stylesheet.url : new URL(stylesheet.url, origin), allowedPaths, errors, cssAliases);
  }

  const htmlLinkRecords = [...htmlMarkup.matchAll(/<link\b([^>]*)>/giu)].map((match) => {
    const attributes = parseAttributes(match[1]);
    return { href: attributes.get("href") || "", attributes, source: "HTML link" };
  });
  for (const record of htmlLinkRecords) {
    inspectPreload(record, origin, allowedPaths, errors, preloadAliases, htmlPreloadCounts);
  }
  for (const record of parseLinkHeader(linkHeader)) {
    inspectPreload(record, origin, allowedPaths, errors, preloadAliases, headerPreloadCounts);
  }

  for (const tag of htmlMarkup.matchAll(/<[^>]+>/gu)) {
    const attributes = parseAttributes(tag[0]);
    if (/^<\s*base\b/iu.test(tag[0])) {
      errors.push("HTML base elements are forbidden because they can retarget relative font aliases.");
    }
    for (const attribute of ["href", "src"]) {
      const rawValue = attributes.get(attribute);
      if (!rawValue) continue;
      try {
        const url = new URL(decodeCssEscapes(rawValue), origin);
        if (url.origin === origin.origin && isPhysicalFontPath(decodedPathname(url))) {
          errors.push(`HTML exposes physical font path ${url.href}.`);
        }
      } catch {
        // Invalid non-font URLs are outside this contract.
      }
    }
  }

  for (const publicPath of allowedPaths) {
    if (!cssAliases.has(publicPath)) errors.push(`Served CSS omits font alias ${publicPath}.`);
    if (!preloadAliases.has(publicPath)) errors.push(`Browser preloads omit font alias ${publicPath}.`);
    const htmlCount = htmlPreloadCounts.get(publicPath) || 0;
    const headerCount = headerPreloadCounts.get(publicPath) || 0;
    if (htmlCount + headerCount > 1) {
      errors.push(`Browser duplicates font preload ${publicPath} across HTML and Link surfaces.`);
    }
  }

  return {
    errors,
    cssAliases: [...cssAliases].sort(),
    preloadAliases: [...preloadAliases].sort(),
  };
}
