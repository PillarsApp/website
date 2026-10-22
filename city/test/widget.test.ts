import { describe, expect, it } from "vitest";
import { DOWN, LONDON_NOON_OCT_22, deps, fetchWith } from "./fixtures";
import { SELF } from "cloudflare:test";

const WIDGET = "/prayer-times/uk/london/widget/";

async function widget(overrides: Partial<Env> = { ENVIRONMENT: "dev" }, now = LONDON_NOON_OCT_22) {
  const res = await fetchWith(WIDGET, deps(DOWN, now), overrides);
  const html = await res.text();
  const data = JSON.parse(/<script id="widget-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);
  return { res, html, data };
}

describe("embed widget", () => {
  it("can be framed by other sites and stays out of search", async () => {
    const { res, html } = await widget();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("is served by the real Worker with no framing headers", async () => {
    const res = await SELF.fetch(`https://thepillarsapp.com${WIDGET}`);
    await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
  });

  it("carries yesterday through day 62 for exactly this city, with the absolute page URL", async () => {
    const { data } = await widget();
    const days = Object.keys(data.days).sort();
    expect(days).toHaveLength(64);
    expect(days[0]).toBe("2026-10-21");
    expect(days[63]).toBe("2026-12-23");
    expect(data.days["2026-10-22"]).toEqual(["06:00", "07:36", "12:50", "15:20", "17:56", "19:17"]);
    expect(data).toMatchObject({ name: "London", place: "London, UK", clock: 24, timezone: "Europe/London", url: "https://thepillarsapp.com/prayer-times/uk/london/" });
    expect(data.names).toEqual(["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });

  it("shares the page's cache contract and expires at local midnight", async () => {
    const now = Date.UTC(2026, 10, 12, 12, 0);
    const first = await widget({ ENVIRONMENT: "test" }, now);
    expect(first.res.headers.get("x-city-cache")).toBe("miss");
    const edge = Number(/s-maxage=(\d+)/.exec(first.res.headers.get("cache-control")!)![1]);
    expect(Math.abs(edge - (Date.UTC(2026, 10, 13, 0, 0) - now) / 1000)).toBeLessThanOrEqual(5);
  });

  it("answers an unknown city with 404 and a slashless URL with a 301", async () => {
    expect((await fetchWith("/prayer-times/uk/narnia/widget/", deps(DOWN))).status).toBe(404);
    const res = await SELF.fetch("https://thepillarsapp.com/prayer-times/uk/london/widget?theme=dark", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://thepillarsapp.com${WIDGET}?theme=dark`);
  });
});
