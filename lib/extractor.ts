import { load } from "cheerio";
import type { Capture, EvidenceBlock, EvidenceBlockKind, SourceRecord } from "./domain";
import { sha256 } from "./hash";
import { canonicalPath, isSameSiteUrl } from "./url-safety";

const MAX_BODY_BLOCKS = 80;
const MAX_LINKS = 40;
const MAX_TEXT_LENGTH = 2_000;

function normalizeText(value: string) {
  return value.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

async function makeBlock(
  capture: Capture,
  kind: EvidenceBlockKind,
  exactText: string,
  position: number,
  options: { targetUrl?: string; assetUrl?: string; warnings?: string[] } = {},
): Promise<EvidenceBlock> {
  const id = `block-${capture.id}-${position}`;
  return {
    id,
    sourceId: capture.sourceId,
    captureId: capture.id,
    kind,
    exactText,
    contentHash: await sha256(`${kind}\n${exactText}\n${options.targetUrl || ""}\n${options.assetUrl || ""}`),
    position,
    originalUrl: capture.originalUrl,
    archiveUrl: capture.archiveUrl,
    capturedAt: capture.capturedAt,
    targetUrl: options.targetUrl,
    assetUrl: options.assetUrl,
    warnings: options.warnings || [],
  };
}

export async function extractSourceRecord(capture: Capture, html: string, rootUrl: string): Promise<SourceRecord> {
  const $ = load(html, { scriptingEnabled: false });
  $("script,style,noscript,iframe,object,embed,form,input,button,textarea,select,template,svg").remove();
  $("*").each((_, element) => {
    const attributes = "attribs" in element ? element.attribs : {};
    for (const attribute of Object.keys(attributes || {})) {
      if (/^on/i.test(attribute) || attribute.toLowerCase() === "srcdoc") $(element).removeAttr(attribute);
    }
  });

  const warnings: string[] = [];
  const blocks: EvidenceBlock[] = [];
  const title = normalizeText($("title").first().text() || $("h1").first().text());
  if (!title) warnings.push("missing_title");
  if (title) blocks.push(await makeBlock(capture, "title", title, blocks.length));

  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("[role='main']").first().length
        ? $("[role='main']").first()
        : $("body");

  const seen = new Set<string>();
  let bodyBlockCount = 0;
  let bodyWasTruncated = false;
  for (const element of root.find("h1,h2,h3,h4,p,li,blockquote").toArray()) {
    const text = normalizeText($(element).text());
    if (text.length < 2 || seen.has(text)) continue;
    if (bodyBlockCount >= MAX_BODY_BLOCKS) {
      bodyWasTruncated = true;
      break;
    }
    const tagName = String($(element).prop("tagName") || "").toLowerCase();
    const kind: EvidenceBlockKind = tagName.startsWith("h")
      ? "heading"
      : tagName === "li"
        ? "list_item"
        : tagName === "blockquote"
          ? "quote"
          : "paragraph";
    seen.add(text);
    blocks.push(await makeBlock(capture, kind, text, blocks.length));
    bodyBlockCount += 1;
  }

  const internalLinks: SourceRecord["internalLinks"] = [];
  for (const element of root.find("a[href]").toArray().slice(0, MAX_LINKS)) {
    const targetUrl = absoluteUrl($(element).attr("href"), capture.originalUrl);
    if (!targetUrl || !isSameSiteUrl(targetUrl, rootUrl)) continue;
    const label = normalizeText($(element).text()) || canonicalPath(targetUrl);
    const block = await makeBlock(capture, "link", label, blocks.length, { targetUrl });
    blocks.push(block);
    internalLinks.push({ targetUrl, sourceBlockId: block.id, label });
  }

  for (const element of root.find("img[src]").toArray().slice(0, 12)) {
    const originalAsset = absoluteUrl($(element).attr("src"), capture.originalUrl);
    if (!originalAsset) continue;
    const alt = normalizeText($(element).attr("alt") || "");
    const assetUrl = `https://web.archive.org/web/${capture.timestamp}id_/${originalAsset}`;
    blocks.push(await makeBlock(capture, "image", alt, blocks.length, {
      assetUrl,
      warnings: alt ? [] : ["missing_image_alt"],
    }));
  }

  if (blocks.filter((block) => !["title", "link", "image"].includes(block.kind)).length === 0) {
    warnings.push("no_readable_body_blocks");
  }
  if (bodyWasTruncated) warnings.push("block_limit_reached");

  return {
    id: `page-${capture.id}`,
    sourceId: capture.sourceId,
    capture,
    canonicalPath: canonicalPath(capture.originalUrl),
    title: title || canonicalPath(capture.originalUrl) || "Recovered page",
    titleBlockId: blocks.find((block) => block.kind === "title")?.id,
    blocks,
    internalLinks,
    warnings,
  };
}
