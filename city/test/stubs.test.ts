import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const get = (path: string) => SELF.fetch(`https://thepillarsapp.com${path}`);

describe("hub and country stubs", () => {
  it("list the cities that have a page, link to them, and stay out of search", async () => {
    const hub = await get("/prayer-times/");
    const html = await hub.text();
    expect(hub.status).toBe(200);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<a href="/prayer-times/uk/london/">London</a>');
    expect(html).toContain('<a href="/prayer-times/uk/">United Kingdom</a>');
    expect(html).not.toContain("/prayer-times/us/");
  });

  it("serve a country with cities and 404 an unknown or empty one", async () => {
    const uk = await get("/prayer-times/uk/");
    expect(uk.status).toBe(200);
    expect(await uk.text()).toContain('<a href="/prayer-times/uk/london/">London</a>');
    expect((await get("/prayer-times/zz/")).status).toBe(404);
  });

  it("renders the 404 with a way back to the hub and no indexing", async () => {
    const res = await get("/prayer-times/uk/narnia/");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain('<a href="/prayer-times/">Prayer times</a>');
  });
});
