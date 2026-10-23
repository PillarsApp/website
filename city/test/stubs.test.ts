import { SELF, createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/index";
import { DOWN, deps, fetchWith, testEnv } from "./fixtures";

const get = (path: string) => SELF.fetch(`https://thepillarsapp.com${path}`);
const inProduction = (path: string) => fetchWith(path, deps(DOWN), { ENVIRONMENT: "production" });
const POSTHOG_KEY = "phc_qHqhPXTDi7US4eoZ8iS5rg4mvjgxjFPM5QVFDHqBKvGn";

describe("hub and country stubs", () => {
  it("list the cities that have a page, link to them, and stay out of search", async () => {
    const hub = await get("/prayer-times/");
    const html = await hub.text();
    expect(hub.status).toBe(200);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<a href="/prayer-times/uk/london/">London</a>');
    expect(html).toContain('<a href="/prayer-times/uk/">United Kingdom</a>');
    expect(html).toContain('<a href="/prayer-times/us/chicago/">Chicago</a>');
    expect(html).toContain('<a href="/prayer-times/ca/">Canada</a>');
  });

  it("serve a country with cities and 404 an unknown or empty one", async () => {
    const uk = await get("/prayer-times/uk/");
    expect(uk.status).toBe(200);
    expect(await uk.text()).toContain('<a href="/prayer-times/uk/london/">London</a>');
    expect((await get("/prayer-times/zz/")).status).toBe(404);
  });

  it("send analytics only to the public audience", async () => {
    for (const path of ["/prayer-times/", "/prayer-times/uk/"]) {
      const publicHtml = await (await inProduction(path)).text();
      expect(publicHtml, path).toContain("plausible.io/js/pa-Xhisz5hgVg6bE5rUMU2-j.js");
      expect(publicHtml, path).toContain(POSTHOG_KEY);
      const previewHtml = await (await get(path)).text();
      expect(previewHtml, path).not.toContain("plausible");
      expect(previewHtml, path).not.toContain(POSTHOG_KEY);
    }
  });

  it("renders the 404 with a way back to the hub and no indexing", async () => {
    const res = await get("/prayer-times/uk/narnia/");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const html = await res.text();
    expect(html).toContain('<a href="/prayer-times/">Prayer times</a>');
    expect(html).not.toContain("plausible");
  });
});

describe("thepillarsapp.com", () => {
  const live = (path: string) => handleFetch(new Request(`https://thepillarsapp.com${path}`), testEnv({ ENVIRONMENT: "production" }), createExecutionContext());

  it("serves only the cities marked live, while staging and previews serve every city", async () => {
    expect((await live("/prayer-times/uk/london/")).status).toBe(200);
    for (const path of ["/prayer-times/us/chicago/", "/prayer-times/uk/luton/", "/prayer-times/uk/luton/widget/", "/prayer-times/us/", "/prayer-times/ca/"]) {
      expect((await live(path)).status, path).toBe(404);
    }
    const hub = await (await live("/prayer-times/")).text();
    expect(hub).toContain('<a href="/prayer-times/uk/london/">London</a>');
    expect(hub).not.toContain("Chicago");
    expect((await get("/prayer-times/us/chicago/")).status).toBe(200);
  });

  it("publishes a sitemap of the live city pages for Search Console", async () => {
    const res = await live("/prayer-times/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const xml = await res.text();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual(["https://thepillarsapp.com/prayer-times/uk/london/"]);
  });
});
