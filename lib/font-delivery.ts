export const FONT_ROUTES = [
  {
    publicPath: "/witness-fonts/geist-latin.woff2",
    assetPath: "/fonts/geist-latin.woff2",
  },
  {
    publicPath: "/witness-fonts/cormorant-garamond-latin.woff2",
    assetPath: "/fonts/cormorant-garamond-latin.woff2",
  },
] as const;

export const FONT_PUBLIC_PATHS = FONT_ROUTES.map(({ publicPath }) => publicPath);
export const FONT_ASSET_PATHS = FONT_ROUTES.map(({ assetPath }) => assetPath);

export const FONT_CACHE_CONTROL = "public, max-age=86400";
export const FONT_WORKER_ROUTE_MARKER = "worker-font-alias-v2";
export const APPLICATION_WORKER_ROUTE_MARKER = "app-worker-v1";

const FONT_ASSET_PATH_BY_PUBLIC_PATH = new Map<string, string>(
  FONT_ROUTES.map(({ publicPath, assetPath }) => [publicPath, assetPath]),
);
const DECORATABLE_ASSET_STATUSES = new Set([200, 206, 304]);

export interface StaticAssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export function isFontAssetRequest(request: Request): boolean {
  return (request.method === "GET" || request.method === "HEAD")
    && FONT_ASSET_PATH_BY_PUBLIC_PATH.has(new URL(request.url).pathname);
}

export function fontAssetRequest(request: Request): Request | null {
  if (!isFontAssetRequest(request)) return null;
  const assetPath = FONT_ASSET_PATH_BY_PUBLIC_PATH.get(new URL(request.url).pathname);
  if (!assetPath) return null;

  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  return new Request(assetUrl, request);
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
  const assetRequest = fontAssetRequest(request);
  if (!assetRequest) return null;
  return decorateFontAssetResponse(await assets.fetch(assetRequest));
}
