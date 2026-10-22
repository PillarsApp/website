// The URL space of the Worker, in one table. Each served route owns both its
// matcher and its link builder, so a link can only be built for a route that
// is in this table, and every route in this table is handled by index.ts (the
// handler map is typed over `RouteName`, so a route without a handler fails
// `tsc`). Static files under ASSET_PREFIX are the one thing served from disk.
//
// The page never emits a link to a route the Worker does not serve: the
// renderer receives PageLinks from linksFor() and has no other way to make a
// path.

import type { City, CityRef, CountrySlug, PageLinks } from "./types";
import { SITE } from "./cities";
import { CLIENT_SCRIPT } from "./generated/client";

// Production routes are `thepillarsapp.com/prayer-times/*` plus the exact
// `thepillarsapp.com/prayer-times`.
export const PREFIX = "/prayer-times";

// `_` cannot be a country slug (those are two letters), so static files never
// shadow a country index.
export const ASSET_PREFIX = `${PREFIX}/_`;

export interface Route<P> {
  // null when the path is not this route. Matching is exact: the slash
  // redirect is canonicalRedirect's job.
  match(path: string): P | null;
  href(params: P): string; // root-relative, canonical form
}

type Empty = Record<never, never>;

const COUNTRY = "([a-z]{2})";
const SLUG = "([a-z0-9]+(?:-[a-z0-9]+)*)";

function route<P>(re: RegExp, toParams: (m: RegExpExecArray) => P, href: (p: P) => string): Route<P> {
  return {
    match(path) {
      const m = re.exec(path);
      return m ? toParams(m) : null;
    },
    href,
  };
}

const cityRef = (m: RegExpExecArray): CityRef => ({ country: m[1] as CountrySlug, slug: m[2] });

// Matched in this order by index.ts. Each key has exactly one handler.
export const routes = {
  // /prayer-times/ (index of countries; the designed hub replaces the renderer, not the route)
  hub: route<Empty>(new RegExp(`^${PREFIX}/$`), () => ({}), () => `${PREFIX}/`),

  // /prayer-times/uk/
  country: route<{ country: string }>(
    new RegExp(`^${PREFIX}/${COUNTRY}/$`),
    (m) => ({ country: m[1] }),
    (p) => `${PREFIX}/${p.country}/`,
  ),

  // /prayer-times/uk/london/
  city: route<CityRef>(new RegExp(`^${PREFIX}/${COUNTRY}/${SLUG}/$`), cityRef, (p) => `${PREFIX}/${p.country}/${p.slug}/`),

  // /prayer-times/uk/london/widget/ (embeddable iframe; rendered like the page)
  widget: route<CityRef>(new RegExp(`^${PREFIX}/${COUNTRY}/${SLUG}/widget/$`), cityRef, (p) => `${PREFIX}/${p.country}/${p.slug}/widget/`),
} as const;

export type RouteName = keyof typeof routes;
export type RouteParams<K extends RouteName> = (typeof routes)[K] extends Route<infer P> ? P : never;

// Slashless forms of served routes 301 to the slashed form, query preserved
// by the caller. Anything else under the prefix is a Worker 404 (never
// Webflow's).
export function canonicalRedirect(path: string): string | null {
  if (path.endsWith("/")) return null;
  const slashed = `${path}/`;
  const served = Object.values(routes).some((r) => (r as Route<unknown>).match(slashed) !== null);
  return served ? slashed : null;
}

// All URLs a city page may emit. The only producer of PageLinks.
export function linksFor(city: City, nearby: readonly City[]): PageLinks {
  const self = routes.city.href(city);
  return {
    canonical: SITE.origin + self,
    hub: routes.hub.href({}),
    country: routes.country.href({ country: city.country }),
    self,
    widgetEmbed: SITE.origin + routes.widget.href(city),
    widgetPreview: routes.widget.href(city),
    nearby: nearby.map((c) => ({ name: c.name, href: routes.city.href(c) })),
    clientScript: CLIENT_SCRIPT,
    assets: ASSET_PREFIX,
    logo: SITE.logo,
  };
}
