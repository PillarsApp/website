import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { canonicalRedirect, linksFor, routes } from "../src/routes";
import { CITIES } from "../src/cities";

const get = (path: string, init?: RequestInit) => SELF.fetch(`https://example.com${path}`, { redirect: "manual", ...init });

describe("slashless URLs", () => {
  it("301 to the slashed form and keep the query", async () => {
    const res = await get("/prayer-times/uk/london?clock=12&theme=night");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://example.com/prayer-times/uk/london/?clock=12&theme=night");
  });

  it("301 plain http to https, adding the slash in the same hop", async () => {
    for (const [path, to] of [["/prayer-times/uk/london/", "/prayer-times/uk/london/"], ["/prayer-times/uk/london?x=1", "/prayer-times/uk/london/?x=1"]]) {
      const res = await SELF.fetch(`http://example.com${path}`, { redirect: "manual" });
      expect(res.status, path).toBe(301);
      expect(res.headers.get("location"), path).toBe(`https://example.com${to}`);
    }
  });

  it("redirect the hub, a country and a widget", () => {
    expect(canonicalRedirect("/prayer-times")).toBe("/prayer-times/");
    expect(canonicalRedirect("/prayer-times/uk")).toBe("/prayer-times/uk/");
    expect(canonicalRedirect("/prayer-times/uk/london/widget")).toBe("/prayer-times/uk/london/widget/");
  });

  it("do not redirect paths that are not routes, so they reach the Worker's 404", () => {
    expect(canonicalRedirect("/prayer-times/_")).toBeNull();
    expect(canonicalRedirect("/prayer-times/uk/London")).toBeNull();
    expect(canonicalRedirect("/prayer-times/uk/london/")).toBeNull();
    expect(canonicalRedirect("/prayer-times-app")).toBeNull();
  });
});

describe("not found and methods", () => {
  it("answers unmatched paths with the Worker's own 404, never a passthrough", async () => {
    for (const path of ["/prayer-times/uk/London/", "/prayer-times/uk/london/index.html", "/prayer-times/zzz/", "/prayer-times/_/nope.png"]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex");
    }
  });

  it("answers POST with 405", async () => {
    const res = await get("/prayer-times/uk/london/", { method: "POST" });
    expect(res.status).toBe(405);
  });
});

describe("route table", () => {
  const refs = [{ country: "uk", slug: "london" }, { country: "ca", slug: "london" }, { country: "us", slug: "new-york" }] as const;

  it("round-trips: match(href(p)) is p, and no other route claims the path", () => {
    for (const ref of refs) {
      for (const name of ["city", "widget"] as const) {
        const href = routes[name].href(ref);
        expect(routes[name].match(href)).toEqual(ref);
        for (const other of Object.keys(routes).filter((n) => n !== name) as (keyof typeof routes)[]) {
          expect(routes[other].match(href), `${other} vs ${href}`).toBeNull();
        }
      }
    }
    expect(routes.hub.match(routes.hub.href({}))).toEqual({});
    expect(routes.country.match(routes.country.href({ country: "uk" }))).toEqual({ country: "uk" });
  });

  it("builds every page link from the table", () => {
    const links = linksFor(CITIES[0], [CITIES[0]]);
    expect(links.self).toBe("/prayer-times/uk/london/");
    expect(links.widgetPreview).toBe("/prayer-times/uk/london/widget/");
    expect(links.widgetEmbed).toBe("https://thepillarsapp.com/prayer-times/uk/london/widget/");
    expect(links.canonical).toBe("https://thepillarsapp.com/prayer-times/uk/london/");
  });
});
