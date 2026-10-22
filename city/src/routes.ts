import type { City, CityRef, CountrySlug, PageLinks } from "./types";
import { SITE } from "./cities";
import { CLIENT_SCRIPT } from "./generated/client";

export const WEBFLOW_PATHS: ReadonlySet<string> = new Set(["/", "/privacy"]);

export const PREFIX = "/prayer-times";

export const ASSET_PREFIX = `${PREFIX}/_`;

export interface Route<P> {
  match(path: string): P | null;
  href(params: P): string;
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

export const routes = {
  hub: route<Empty>(new RegExp(`^${PREFIX}/$`), () => ({}), () => `${PREFIX}/`),

  country: route<{ country: string }>(
    new RegExp(`^${PREFIX}/${COUNTRY}/$`),
    (m) => ({ country: m[1] }),
    (p) => `${PREFIX}/${p.country}/`,
  ),

  city: route<CityRef>(new RegExp(`^${PREFIX}/${COUNTRY}/${SLUG}/$`), cityRef, (p) => `${PREFIX}/${p.country}/${p.slug}/`),

  widget: route<CityRef>(new RegExp(`^${PREFIX}/${COUNTRY}/${SLUG}/widget/$`), cityRef, (p) => `${PREFIX}/${p.country}/${p.slug}/widget/`),
} as const;

export type RouteName = keyof typeof routes;
export type RouteParams<K extends RouteName> = (typeof routes)[K] extends Route<infer P> ? P : never;

export function canonicalRedirect(path: string): string | null {
  if (path.endsWith("/")) return null;
  const slashed = `${path}/`;
  const served = Object.values(routes).some((r) => (r as Route<unknown>).match(slashed) !== null);
  return served ? slashed : null;
}

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
