import { routes, canonicalRedirect, linksFor, type RouteName, type RouteParams } from "./routes";
import { staticRegistry, type CityRegistry } from "./registry";
import { liveMosqueSource, noMosques, type MosqueDirectory, type MosqueSource } from "./mosques";
import { renderCityPage } from "./render/page";
import { renderWidget } from "./render/widget";
import { renderHubStub, renderCountryStub, renderNotFound } from "./render/stubs";
import { cityClock } from "./render/times";
import { timetableFor } from "./timetables";
import { CITIES, SITE } from "./cities";
import { edgeCache } from "./cache";
import type { Audience, City, CityRef, Country, Instant, LocalDate, Rendered, Timetable } from "./types";

export interface Deps {
  registry: (audience: Audience) => CityRegistry;
  mosqueSource: (env: Env) => MosqueSource;
  now: () => Instant;
}

const previewRegistry = staticRegistry();
const publicRegistry = staticRegistry(CITIES.filter((c) => c.live));

const defaultDeps: Deps = {
  registry: (audience) => (audience === "public" ? publicRegistry : previewRegistry),
  mosqueSource: (env) => liveMosqueSource({
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
  readonly registry: CityRegistry;
}
type Handler<P> = (call: Call<P>) => Promise<Response>;

const HTML = "text/html; charset=utf-8";

const audienceOf = (env: Env): Audience => (env.ENVIRONMENT === "production" ? "public" : "preview");

const HUB_LINK = { name: "Prayer times", href: routes.hub.href({}) };
const cityLink = (c: City) => ({ name: c.name, href: routes.city.href(c) });

function stubResponse(html: string): Response {
  return new Response(html, { headers: { "Content-Type": HTML, "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}

const handlers: { [K in RouteName]: Handler<RouteParams<K>> } = {
  hub: async ({ registry, env }) => {
    const countries = await Promise.all(
      registry.countries().map(async (c) => ({
        name: c.name,
        href: routes.country.href({ country: c.slug }),
        cities: (await registry.inCountry(c.slug)).map(cityLink),
      })),
    );
    return stubResponse(renderHubStub(countries.filter((c) => c.cities.length), audienceOf(env)));
  },
  country: async ({ params, registry, env }) => {
    const country = registry.country(params.country);
    if (!country) return notFound();
    const cities = await registry.inCountry(country.slug);
    if (!cities.length) return notFound();
    return stubResponse(renderCountryStub(country.name, cities.map(cityLink), HUB_LINK, audienceOf(env)));
  },
  city: (call) =>
    serveCity(call, routes.city.href(call.params), async ({ city, country, timetable, date, now }) => {
      const { env, deps, registry } = call;
      const [mosques, nearby] = await Promise.all([
        (city.mosques ? deps.mosqueSource(env) : noMosques).forCity(city, date),
        registry.nearby(city, 10),
      ]);
      return renderCityPage({
        city, country, timetable, date, now, mosques,
        links: linksFor(city, nearby),
        audience: audienceOf(env),
      });
    }),
  widget: (call) =>
    serveCity(call, routes.widget.href(call.params), async ({ city, country, timetable, date, now }) =>
      renderWidget({ city, country, timetable, date, now, pageUrl: SITE.origin + routes.city.href(city) })),
};

interface CityRender {
  readonly city: City;
  readonly country: Country;
  readonly timetable: Timetable | null;
  readonly date: LocalDate;
  readonly now: Instant;
}

async function serveCity(call: Call<CityRef>, path: string, render: (c: CityRender) => Promise<Rendered>): Promise<Response> {
  const { url, params, request, env, ctx, deps, registry } = call;
  const city = await registry.get(params);
  if (!city) return notFound();
  const country = registry.country(city.country)!;
  const now = devNow(url, env, city, country) ?? deps.now();
  const date = cityClock(city, country).today(now);
  return edgeCache(env, ctx).respond({ request, path, date, now, contentType: HTML }, () => render({ city, country, timetable: timetableFor(city), date, now }));
}

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
  // The zone leaves Always Use HTTPS off, because behind Webflow's Cloudflare it can get in the way of the
  // certificate renewal; the Worker upgrades its own paths instead, in the same hop as the slash.
  const insecure = url.protocol === "http:" && env.ENVIRONMENT !== "dev";
  const redirect = canonicalRedirect(url.pathname);
  if (redirect || insecure) {
    return Response.redirect(`${insecure ? `https://${url.host}` : url.origin}${redirect ?? url.pathname}${url.search}`, 301);
  }
  for (const name of Object.keys(routes) as RouteName[]) {
    const params = routes[name].match(url.pathname);
    if (params) return (handlers[name] as Handler<unknown>)({ url, params, request, env, ctx, deps, registry: deps.registry(audienceOf(env)) });
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
