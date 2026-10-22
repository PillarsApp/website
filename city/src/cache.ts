import type { Instant, LocalDate, Rendered } from "./types";
import { BUILD_ID } from "./generated/client";

export const BROWSER_MAX_AGE_S = 300;
export const MIN_EDGE_TTL_S = 30;

export interface CachedCall {
  readonly request: Request;
  readonly path: string;
  readonly date: LocalDate;
  readonly now: Instant;
  readonly contentType: string;
}

export interface CachedResponder {
  respond(call: CachedCall, render: () => Promise<Rendered>): Promise<Response>;
}

export function edgeCache(env: Env, ctx: ExecutionContext): CachedResponder {
  return {
    async respond(call, render) {
      if (env.ENVIRONMENT === "dev") {
        const response = responseFor(await render(), call, "bypass");
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const cache = caches.default;
      const key = cacheKey(new URL(call.request.url).origin, call.path, call.date);
      const hit = await cache.match(key);
      if (hit) return withCacheStatus(hit, "hit");
      const response = responseFor(await render(), call, "miss");
      ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    },
  };
}

export function cacheKey(origin: string, path: string, date: LocalDate): Request {
  return new Request(`${origin}${path}?b=${BUILD_ID}&d=${date}`, { method: "GET" });
}

export function headersFor(rendered: Rendered, now: Instant, contentType: string): Headers {
  const edge = Math.max(MIN_EDGE_TTL_S, Math.floor((rendered.freshUntil - now) / 1000));
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": `public, max-age=${Math.min(BROWSER_MAX_AGE_S, edge)}, s-maxage=${edge}`,
  });
}

function responseFor(rendered: Rendered, call: CachedCall, status: "miss" | "bypass"): Response {
  const headers = headersFor(rendered, call.now, call.contentType);
  headers.set("x-city-cache", status);
  return new Response(rendered.html, { headers });
}

function withCacheStatus(cached: Response, status: "hit"): Response {
  const response = new Response(cached.body, cached);
  response.headers.set("x-city-cache", status);
  return response;
}
