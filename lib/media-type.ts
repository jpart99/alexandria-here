const MEDIA_TYPE = /^[!#$%&'*+\-.^_`|~0-9a-z]+\/[!#$%&'*+\-.^_`|~0-9a-z]+$/;

export function parseMediaType(header: string | null | undefined): string | null {
  const value = (header || "").split(";", 1)[0].trim().toLowerCase();
  return MEDIA_TYPE.test(value) ? value : null;
}

export function isJsonMediaType(header: string | null | undefined): boolean {
  const mediaType = parseMediaType(header);
  return mediaType === "application/json"
    || Boolean(mediaType?.startsWith("application/") && mediaType.endsWith("+json"));
}

export function isHtmlMediaType(header: string | null | undefined): boolean {
  const mediaType = parseMediaType(header);
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}
