import type { Audience } from "../types";
import { esc } from "./html";
import { analyticsFor } from "./analytics";

export interface Link {
  readonly name: string;
  readonly href: string;
}

function shell(title: string, body: string, analytics = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} | Pillars</title>
<style>body{margin:0;padding:32px 20px;font:16px/1.5 system-ui,sans-serif;color:#00193e;background:#fff}main{max-width:640px;margin:0 auto}a{color:inherit}ul{padding-left:20px}@media (prefers-color-scheme:dark){body{color:#fff;background:#00193e}}</style>
</head>
<body>
<main>
${body}
</main>
${analytics}
</body>
</html>
`;
}

const list = (links: readonly Link[]) => `<ul>\n${links.map((l) => `<li><a href="${l.href}">${esc(l.name)}</a></li>`).join("\n")}\n</ul>`;

export function renderHubStub(countries: readonly (Link & { readonly cities: readonly Link[] })[], audience: Audience): string {
  const sections = countries.map((c) => `<h2><a href="${c.href}">${esc(c.name)}</a></h2>\n${list(c.cities)}`).join("\n");
  return shell("Prayer Times", `<h1>Prayer times</h1>\n${sections}`, analyticsFor(audience));
}

export function renderCountryStub(country: string, cities: readonly Link[], hub: Link, audience: Audience): string {
  return shell(`Prayer Times in ${country}`, `<p><a href="${hub.href}">${esc(hub.name)}</a></p>\n<h1>Prayer times in ${esc(country)}</h1>\n${list(cities)}`, analyticsFor(audience));
}

// Webflow's /sitemap.xml cannot list the Worker's pages, so the Worker publishes its own for Search Console.
export function renderSitemap(urls: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}
</urlset>
`;
}

export function renderNotFound(hub: Link): string {
  return shell("Page not found", `<h1>Page not found</h1>\n<p><a href="${hub.href}">${esc(hub.name)}</a></p>`);
}
