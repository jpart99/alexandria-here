export const FONT_ASSET_PATHS = [
  "/fonts/geist-latin.woff2",
  "/fonts/cormorant-garamond-latin.woff2",
] as const;

export const FONT_CACHE_CONTROL = "public, max-age=86400";
export const FONT_WORKER_ROUTE_MARKER = "worker-font-v1";
export const APPLICATION_WORKER_ROUTE_MARKER = "app-worker-v1";

const FONT_ASSET_PATH_SET = new Set<string>(FONT_ASSET_PATHS);
const DECORATABLE_ASSET_STATUSES = new Set([200, 206, 304]);

export interface StaticAssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export function isFontAssetRequest(request: Request): boolean {
  return (request.method === "GET" || request.method === "HEAD")
    && FONT_ASSET_PATH_SET.has(new URL(request.url).pathname);
}

export function decorateFontAssetResponse(response: Response): Response {
  if (!DECORATABLE_ASSET_STATUSES.has(response.status)) return response;

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "font/woff2");
  headers.set("Cache-Control", FONT_CACHE_CONTROL);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Alexandria-Asset-Route", FONT_WORKER_ROUTE_MARKER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function fetchFontAsset(
  request: Request,
  assets: StaticAssetFetcher,
): Promise<Response | null> {
  if (!isFontAssetRequest(request)) return null;
  return decorateFontAssetResponse(await assets.fetch(request));
}
