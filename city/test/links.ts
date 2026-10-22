/// <reference types="vite/client" />
import { SELF } from "cloudflare:test";

const ORIGIN = "https://thepillarsapp.com";
// Static files answer before the Worker in production and in wrangler dev; the
// test Worker has no assets binding, so existence on disk stands in for them.
const STATIC_FILES = new Set(Object.keys(import.meta.glob("../public/**/*", { query: "?url" })).map((p) => p.replace("../public", "")));
const ASSET_PREFIX = "/prayer-times/_/";
// Same-origin paths outside the Worker's prefix that Webflow serves.
const WEBFLOW_PATHS = new Set(["/"]);

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
}

// Every URL a page names: href/src attributes, og/twitter/canonical metas and
// every absolute URL inside its JSON-LD.
export function urlsIn(html: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) urls.push(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content="(https?:\/\/[^"]*)"/g)) urls.push(m[1]);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const strings: string[] = [];
    collectStrings(JSON.parse(m[1]), strings);
    urls.push(...strings.filter((s) => /^https?:\/\//.test(s)));
  }
  return urls.map((u) => u.replace(/&amp;/g, "&"));
}

// Same-origin paths (fragment and query dropped) from a page's URLs.
export function sameOriginPaths(pageUrl: string, urls: string[]): string[] {
  const paths = new Set<string>();
  for (const u of urls) {
    if (u.startsWith("#") || /^(mailto:|data:)/.test(u)) continue;
    const abs = new URL(u, pageUrl);
    if (abs.origin === ORIGIN) paths.add(abs.pathname);
  }
  return [...paths].sort();
}

// Same-origin paths that nothing serves: routes the Worker answers with
// something other than 200, and asset paths with no file under public/.
// Webflow's own pages are skipped.
export async function unservedPaths(pageUrl: string, html: string): Promise<string[]> {
  const bad: string[] = [];
  for (const path of sameOriginPaths(pageUrl, urlsIn(html))) {
    if (WEBFLOW_PATHS.has(path)) continue;
    if (path.startsWith(ASSET_PREFIX)) {
      if (!STATIC_FILES.has(path)) bad.push(`${path} -> no file`);
      continue;
    }
    const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
    await res.arrayBuffer();
    if (res.status !== 200) bad.push(`${path} -> ${res.status}`);
  }
  return bad;
}
