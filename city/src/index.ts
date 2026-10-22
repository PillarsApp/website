// Entry point. Thin shell: match a route, call its handler. Static files under
// /prayer-times/_/ are answered by Workers static assets before this code runs.
//
// Invariant: every request under /prayer-times/ is answered here. There is no
// fetch(request) passthrough and no passThroughOnException(): behind
// Orange-to-Orange either would hand the request to Webflow, which 301s the
// slash away and 404s.

import { routes, canonicalRedirect, linksFor, type RouteName, type RouteParams } from "./routes";
import { staticRegistry, type CityRegistry } from "./registry";
import { liveMosqueSource, noMosques, type MosqueSource } from "./mosques";
import { renderCityPage } from "./render/page";
import { cityClock } from "./render/times";
import { edgeCache } from "./cache";
import type { City, Country, Instant, LocalDate } from "./types";

export interface Deps {
  registry: CityRegistry;
  mosqueSource: (env: Env) => MosqueSource;
  now: () => Instant;
}

const defaultDeps: Deps = {
  registry: staticRegistry(),
  mosqueSource: (env) => liveMosqueSource({ baseUrl: env.MASJID_TIMES_URL, secret: env.MASJID_TIMES_SECRET }),
  now: Date.now,
};

interface Call<P> {
  readonly url: URL;
  readonly params: P;
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly deps: Deps;
}
type Handler<P> = (call: Call<P>) => Promise<Response>;

const HTML = "text/html; charset=utf-8";

const notImplemented: Handler<unknown> = async () => new Response("not implemented", { status: 501 });

// Typed over the route table: a route without a handler is a compile error,
// and so is a handler for a route that does not exist.
const handlers: { [K in RouteName]: Handler<RouteParams<K>> } = {
  hub: notImplemented,
  country: notImplemented,
  city: async ({ url, params, request, env, ctx, deps }) => {
    const city = await deps.registry.get(params);
    if (!city) return notFound();
    const country = deps.registry.country(city.country)!;
    const clock = cityClock(city, country);
    const now = devNow(url, env, city, country) ?? deps.now();
    const date = clock.today(now);
    return edgeCache(env, ctx).respond({ request, path: routes.city.href(city), date, now, contentType: HTML }, async () => {
      const [mosques, nearby] = await Promise.all([
        (city.mosques ? deps.mosqueSource(env) : noMosques).forCity(city, date),
        deps.registry.nearby(city, 10),
      ]);
      return renderCityPage({
        city, country, date, now, mosques,
        links: linksFor(city, nearby),
        indexable: env.ENVIRONMENT === "production",
      });
    });
  },
  widget: notImplemented,
};

// In dev only, ?now=YYYY-MM-DDTHH:mm (city-local) pins the server's clock the
// way it pins city.js, so the rendered tables and FAQ match what the browser
// shows. Ignored everywhere else, so it can never reach a cache key.
function devNow(url: URL, env: Env, city: City, country: Country): Instant | null {
  if (env.ENVIRONMENT !== "dev") return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(url.searchParams.get("now") ?? "");
  if (!m) return null;
  return cityClock(city, country).localInstant(m[1] as LocalDate, +m[2], +m[3]);
}

export async function handleFetch(request: Request, env: Env, ctx: ExecutionContext, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const redirect = canonicalRedirect(url.pathname);
  if (redirect) return Response.redirect(`${url.origin}${redirect}${url.search}`, 301);
  for (const name of Object.keys(routes) as RouteName[]) {
    const params = routes[name].match(url.pathname);
    if (params) return (handlers[name] as Handler<unknown>)({ url, params, request, env, ctx, deps });
  }
  return notFound();
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
