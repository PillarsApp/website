import { env, createExecutionContext } from "cloudflare:test";
import { handleFetch, type Deps } from "../src/index";
import { staticRegistry, type CityRegistry } from "../src/registry";
import { COUNTRIES } from "../src/cities";
import { plainText } from "../src/render/html";
import { renderCityPage } from "../src/render/page";
import { cityClock } from "../src/render/times";
import { linksFor } from "../src/routes";
import type { City, LocalDate, MosqueSection, Timetable } from "../src/types";
import type { MosqueSource } from "../src/mosques";

export { FOUR_MOSQUES } from "./mosque-fixtures";

export const LONDON_NOON_OCT_22 = Date.UTC(2026, 9, 22, 11, 0);

export const DOWN: MosqueSection = { kind: "unavailable", reason: "error" };

export function deps(section: MosqueSection, now: number = LONDON_NOON_OCT_22, registry: CityRegistry = staticRegistry()): Deps {
  const source: MosqueSource = { forCity: async () => section };
  return { registry, mosqueSource: () => source, now: () => now };
}

// A city page rendered at noon on a date, with the visible text flattened for copy assertions.
export function renderPage(city: City, date: LocalDate = "2026-10-22", timetable: Timetable | null = null) {
  const country = COUNTRIES[city.country];
  const now = cityClock(city, country).localInstant(date, 12, 0);
  const html = renderCityPage({ city, country, timetable, date, now, mosques: DOWN, links: linksFor(city, []), audience: "public" }).html;
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
  return { html, text: plainText(visible).replace(/\s+/g, " ") };
}

export function faqOf(html: string): { name: string; acceptedAnswer: { text: string } }[] {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1])["@graph"];
  return ld.find((n: { "@type": string }) => n["@type"] === "FAQPage").mainEntity;
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...env, ...overrides };
}

export const get = (path: string, init?: RequestInit) => new Request(`https://thepillarsapp.com${path}`, init);

export async function fetchWith(path: string, d: Deps, overrides: Partial<Env> = {}): Promise<Response> {
  return handleFetch(get(path), testEnv(overrides), createExecutionContext(), d);
}
