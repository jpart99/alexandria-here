import { load } from "cheerio";
import type { Capture, EvidenceBlock, EvidenceBlockKind, SourceRecord } from "./domain";
import { evidenceBlockHashInput, sha256 } from "./hash";
import { canonicalPath, isSameSiteUrl } from "./url-safety";

const MAX_BODY_BLOCKS = 80;
const MAX_LINKS = 40;
const MAX_TEXT_LENGTH = 2_000;

function normalizeText(value: string) {
  const normalized = value.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  return {
    exactText: normalized.slice(0, MAX_TEXT_LENGTH),
    normalized,
    truncated: normalized.length > MAX_TEXT_LENGTH,
  };
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
  const block = {
    id,
    sourceId: capture.sourceId,
    captureId: capture.id,
    kind,
    exactText,
    position,
    originalUrl: capture.originalUrl,
    archiveUrl: capture.archiveUrl,
    capturedAt: capture.capturedAt,
    targetUrl: options.targetUrl,
    assetUrl: options.assetUrl,
    warnings: options.warnings || [],
  };
  return { ...block, contentHash: await sha256(evidenceBlockHashInput(block)) };
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
  const boundedElementText = (element: ReturnType<typeof $>) => {
    const clone = element.clone();
    clone.find("br").replaceWith(" ");
    return normalizeText(clone.text());
  };
  const titleElement = $("title").first().length ? $("title").first() : $("h1").first();
  const titleText = boundedElementText(titleElement);
  const title = titleText.exactText;
  if (!title) warnings.push("missing_title");
  if (title) {
    blocks.push(await makeBlock(capture, "title", title, blocks.length, {
      warnings: titleText.truncated ? ["text_truncated:title"] : [],
    }));
  }

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
    const bounded = boundedElementText($(element));
    const text = bounded.exactText;
    if (text.length < 2 || seen.has(bounded.normalized)) continue;
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
    seen.add(bounded.normalized);
    blocks.push(await makeBlock(capture, kind, text, blocks.length, {
      warnings: bounded.truncated ? [`text_truncated:${kind}`] : [],
    }));
    bodyBlockCount += 1;
  }

  const internalLinks: SourceRecord["internalLinks"] = [];
  for (const element of root.find("a[href]").toArray().slice(0, MAX_LINKS)) {
    const targetUrl = absoluteUrl($(element).attr("href"), capture.originalUrl);
    if (!targetUrl || !isSameSiteUrl(targetUrl, rootUrl)) continue;
    const boundedLabel = boundedElementText($(element));
    const label = boundedLabel.exactText || canonicalPath(targetUrl);
    const blockWarnings = [
      ...(boundedLabel.truncated ? ["text_truncated:link_label"] : []),
      ...(!boundedLabel.exactText ? ["missing_link_label"] : []),
    ];
    const block = await makeBlock(capture, "link", boundedLabel.exactText, blocks.length, {
      targetUrl,
      warnings: blockWarnings,
    });
    blocks.push(block);
    internalLinks.push({ targetUrl, sourceBlockId: block.id, label });
  }

  for (const element of root.find("img[src]").toArray().slice(0, 12)) {
    const originalAsset = absoluteUrl($(element).attr("src"), capture.originalUrl);
    if (!originalAsset) continue;
    const boundedAlt = normalizeText($(element).attr("alt") || "");
    const alt = boundedAlt.exactText;
    const assetUrl = `https://web.archive.org/web/${capture.timestamp}id_/${originalAsset}`;
    blocks.push(await makeBlock(capture, "image", alt, blocks.length, {
      assetUrl,
      warnings: [
        ...(boundedAlt.truncated ? ["text_truncated:image_alt"] : []),
        ...(!alt ? ["missing_image_alt"] : []),
      ],
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
