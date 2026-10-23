import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DOWN, LONDON_NOON_OCT_22, deps, fetchWith } from "./fixtures";
import { sameOriginPaths, unservedPaths, urlsIn } from "./links";

const ORIGIN = "https://thepillarsapp.com";

async function page(path: string) {
  const res = await SELF.fetch(`${ORIGIN}${path}`);
  return res.text();
}

describe("every URL the Worker's pages emit is served", () => {
  it("on the London page", async () => {
    const html = await page("/prayer-times/uk/london/");
    const paths = sameOriginPaths(`${ORIGIN}/prayer-times/uk/london/`, urlsIn(html));
    expect(paths).toEqual(expect.arrayContaining([
      "/prayer-times/uk/london/",
      "/prayer-times/_/tree_two.png", "/prayer-times/_/adhan-4.4.3.umd.min.js",
    ]));
    expect(paths.some((p) => p.startsWith("/prayer-times/_/city."))).toBe(true);
    expect(paths.some((p) => p.startsWith("/prayer-times/_/fonts/"))).toBe(true);
    expect(await unservedPaths(`${ORIGIN}/prayer-times/uk/london/`, html)).toEqual([]);
  });

  it("on a public page, including the consent banner's privacy link", async () => {
    const url = `${ORIGIN}/prayer-times/uk/london/`;
    const res = await fetchWith("/prayer-times/uk/london/", deps(DOWN, LONDON_NOON_OCT_22 + 7 * 86_400_000), { ENVIRONMENT: "production" });
    const html = await res.text();
    expect(sameOriginPaths(url, urlsIn(html))).toContain("/privacy");
    expect(await unservedPaths(url, html)).toEqual([]);
  });

  it("flags a same-origin path that neither the Worker nor Webflow serves", async () => {
    expect(await unservedPaths(`${ORIGIN}/prayer-times/uk/london/`, '<a href="/not-a-page">x</a>')).toEqual(["/not-a-page -> 404"]);
  });

  it("on the London widget", async () => {
    const url = `${ORIGIN}/prayer-times/uk/london/widget/`;
    const html = await page("/prayer-times/uk/london/widget/");
    expect(await unservedPaths(url, html)).toEqual([]);
  });

  it("on the hub and country stubs", async () => {
    for (const path of ["/prayer-times/", "/prayer-times/uk/"]) {
      const html = await page(path);
      expect(sameOriginPaths(`${ORIGIN}${path}`, urlsIn(html)).length, path).toBeGreaterThan(0);
      expect(await unservedPaths(`${ORIGIN}${path}`, html), path).toEqual([]);
    }
  });

  it("flags a dangling route and a missing asset", async () => {
    const html = '<a href="/prayer-times/uk/narnia/">x</a><img src="/prayer-times/_/nope.png"><a href="widget/">fine</a>';
    expect(await unservedPaths(`${ORIGIN}/prayer-times/uk/london/`, html)).toEqual([
      "/prayer-times/_/nope.png -> no file",
      "/prayer-times/uk/narnia/ -> 404",
    ]);
  });

  it("on the Worker's 404", async () => {
    const res = await SELF.fetch(`${ORIGIN}/prayer-times/uk/narnia/`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(await unservedPaths(`${ORIGIN}/prayer-times/uk/narnia/`, html)).toEqual([]);
  });
});
