// Entry point. Thin shell: match a route, call its handler. Static files under
// /prayer-times/_/ are answered by Workers static assets before this code runs.
//
// Invariant: every request under /prayer-times/ is answered here. There is no
// fetch(request) passthrough and no passThroughOnException(): behind
// Orange-to-Orange either would hand the request to Webflow, which 301s the
// slash away and 404s.

import { routes, canonicalRedirect, linksFor, type RouteName, type RouteParams } from "./routes";
import { staticRegistry, type CityRegistry } from "./registry";
import { liveMosqueSource, noMosques, type MosqueDirectory, type MosqueSource } from "./mosques";
import { renderCityPage } from "./render/page";
import { renderWidget } from "./render/widget";
import { renderHubStub, renderCountryStub, renderNotFound } from "./render/stubs";
import { cityClock } from "./render/times";
import { SITE } from "./cities";
import { edgeCache } from "./cache";
import type { Audience, City, CityRef, Country, Instant, LocalDate, Rendered } from "./types";

export interface Deps {
  registry: CityRegistry;
  mosqueSource: (env: Env) => MosqueSource;
  now: () => Instant;
}

const defaultDeps: Deps = {
  registry: staticRegistry(),
  mosqueSource: (env) => liveMosqueSource({
    // `wrangler types` cannot type another Worker's entrypoint (a bare Service),
    // and tests that inject no binding leave it undefined.
    directory: env.MASJID_TIMES as unknown as MosqueDirectory | undefined,
  }),
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

// The one place that decides who a page is for. Staging, dev and test must
// never be indexed or send analytics.
const audienceOf = (env: Env): Audience => (env.ENVIRONMENT === "production" ? "public" : "preview");

const HUB_LINK = { name: "Prayer times", href: routes.hub.href({}) };
const cityLink = (c: City) => ({ name: c.name, href: routes.city.href(c) });

function stubResponse(html: string): Response {
  return new Response(html, { headers: { "Content-Type": HTML, "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}

// Typed over the route table: a route without a handler is a compile error,
// and so is a handler for a route that does not exist.
const handlers: { [K in RouteName]: Handler<RouteParams<K>> } = {
  hub: async ({ deps, env }) => {
    const countries = await Promise.all(
      deps.registry.countries().map(async (c) => ({
        name: c.name,
        href: routes.country.href({ country: c.slug }),
        cities: (await deps.registry.inCountry(c.slug)).map(cityLink),
      })),
    );
    return stubResponse(renderHubStub(countries.filter((c) => c.cities.length), audienceOf(env)));
  },
  country: async ({ params, deps, env }) => {
    const country = deps.registry.country(params.country);
    if (!country) return notFound();
    const cities = await deps.registry.inCountry(country.slug);
    return stubResponse(renderCountryStub(country.name, cities.map(cityLink), HUB_LINK, audienceOf(env)));
  },
  city: (call) =>
    serveCity(call, routes.city.href(call.params), async ({ city, country, date, now }) => {
      const { env, deps } = call;
      const [mosques, nearby] = await Promise.all([
        (city.mosques ? deps.mosqueSource(env) : noMosques).forCity(city, date),
        deps.registry.nearby(city, 10),
      ]);
      return renderCityPage({
        city, country, date, now, mosques,
        links: linksFor(city, nearby),
        audience: audienceOf(env),
      });
    }),
  widget: (call) =>
    serveCity(call, routes.widget.href(call.params), async ({ city, country, date, now }) =>
      renderWidget({ city, country, date, now, pageUrl: SITE.origin + routes.city.href(city) })),
};

interface CityRender {
  readonly city: City;
  readonly country: Country;
  readonly date: LocalDate;
  readonly now: Instant;
}

// The shared request path of every per-city page: look the city up (404 if
// unknown), decide what local day it is, and let the edge cache decide
// whether to render.
async function serveCity(call: Call<CityRef>, path: string, render: (c: CityRender) => Promise<Rendered>): Promise<Response> {
  const { url, params, request, env, ctx, deps } = call;
  const city = await deps.registry.get(params);
  if (!city) return notFound();
  const country = deps.registry.country(city.country)!;
  const now = devNow(url, env, city, country) ?? deps.now();
  const date = cityClock(city, country).today(now);
  return edgeCache(env, ctx).respond({ request, path, date, now, contentType: HTML }, () => render({ city, country, date, now }));
}

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
  return new Response(renderNotFound(HUB_LINK), {
    status: 404,
    headers: { "Content-Type": HTML, "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" },
  });
}

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
