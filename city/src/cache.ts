// Freshness. One render per (city, local day, deploy). Nothing else sets a
// Cache-Control header for rendered content.
//
// Key:    <origin><canonical path>?b=<BUILD_ID>&d=<city-local date>
//         Built from the route's canonical href, never from the incoming URL:
//         ?clock, ?now, ?theme, ?safe and utm_* are client-side only, so all
//         of them share one entry. The date is in the key so a page can never
//         be served on the wrong local day even if a TTL is wrong.
// TTL:    from Rendered.freshUntil (city-local midnight, or 10 minutes when the
//         mosque section was unavailable), as s-maxage; browsers get at most 5 min.
// Deploy: BUILD_ID changes on every client build, which every deploy runs, so
//         the whole cache misses after a deploy with no purge call. Old
//         entries expire on their own TTL.
// Staging: Cache API is a no-op on *.workers.dev, so every request renders;
//         headers are identical so curl shows the contract.
// Dev:    ENVIRONMENT=dev bypasses the cache and tells the browser not to keep
//         the page: someone iterating on CSS must never see yesterday's render.
//         ENVIRONMENT=test uses the cache, so tests run against miniflare's.

import type { Instant, LocalDate, Rendered } from "./types";
import { BUILD_ID } from "./generated/client";

export const BROWSER_MAX_AGE_S = 300;
export const MIN_EDGE_TTL_S = 30;

export interface CachedCall {
  readonly request: Request;
  readonly path: string; // canonical, from the route
  readonly date: LocalDate; // city-local date being served
  readonly now: Instant;
  readonly contentType: string;
}

export interface CachedResponder {
  // Returns the cached Response for the call, or renders, stores and returns
  // it. `x-city-cache: hit | miss | bypass` tells curl what happened.
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

// Cache-Control: public, max-age=<min(300, ttl)>, s-maxage=<max(30, freshUntil - now)>
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
