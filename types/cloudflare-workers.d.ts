declare module "cloudflare:workers" {
  export function waitUntil(promise: Promise<unknown>): void;
  export const env: {
    DB: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  };
}

declare global {
  interface Env {
    DB: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}

export {};
