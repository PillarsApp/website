import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/index";
import { cacheKey } from "../src/cache";
import { DOWN, FOUR_MOSQUES, deps, get, testEnv } from "./fixtures";

async function serve(path: string, now: number, section = FOUR_MOSQUES, overrides: Partial<Env> = {}) {
  const ctx = createExecutionContext();
  const res = await handleFetch(get(path), testEnv(overrides), ctx, deps(section, now));
  const body = await res.text();
  await waitOnExecutionContext(ctx);
  return { res, body };
}

const PAGE = "/prayer-times/uk/london/";
const sMaxAge = (res: Response) => Number(/s-maxage=(\d+)/.exec(res.headers.get("cache-control")!)![1]);

describe("edge cache", () => {
  it("expires at London's next local midnight", async () => {
    const now = Date.UTC(2026, 10, 3, 11, 0); // 11:00 GMT
    const { res } = await serve(PAGE, now);
    const untilMidnight = (Date.UTC(2026, 10, 4, 0, 0) - now) / 1000;
    expect(Math.abs(sMaxAge(res) - untilMidnight)).toBeLessThanOrEqual(5);
    expect(res.headers.get("cache-control")).toMatch(/max-age=300,/);
  });

  it("retries within ten minutes when mosques were unavailable", async () => {
    const { res } = await serve(PAGE, Date.UTC(2026, 10, 5, 11, 0), DOWN);
    expect(sMaxAge(res)).toBeLessThanOrEqual(600);
  });

  it("shares one entry across ?clock, ?now, ?theme, ?safe and utm_*", async () => {
    const now = Date.UTC(2026, 10, 6, 11, 0);
    const first = await serve(PAGE, now);
    expect(first.res.headers.get("x-city-cache")).toBe("miss");
    const second = await serve(`${PAGE}?theme=night&utm_source=x&clock=12&now=2030-01-01T00:00&safe=1`, now);
    expect(second.res.headers.get("x-city-cache")).toBe("hit");
    expect(second.body).toBe(first.body);
  });

  it("serves a new local day from a new entry, never yesterday's", async () => {
    const evening = Date.UTC(2026, 10, 7, 23, 30);
    const morning = Date.UTC(2026, 10, 8, 0, 30);
    const a = await serve(PAGE, evening);
    const b = await serve(PAGE, morning);
    expect(b.res.headers.get("x-city-cache")).toBe("miss");
    expect(a.body).toContain('data-date="2026-11-07"');
    expect(b.body).toContain('data-date="2026-11-08"');
  });

  it("keys on the deploy and the local date, and on nothing from the request", () => {
    const key = new URL(cacheKey("https://thepillarsapp.com", PAGE, "2026-11-09").url);
    expect(key.pathname).toBe(PAGE);
    expect([...key.searchParams.keys()].sort()).toEqual(["b", "d"]);
    expect(key.searchParams.get("d")).toBe("2026-11-09");
  });

  it("bypasses the cache in dev, tells the browser not to keep the page, and honours ?now", async () => {
    const now = Date.UTC(2026, 10, 10, 11, 0);
    const dev = { ENVIRONMENT: "dev" };
    const a = await serve(`${PAGE}?now=2026-12-30T10:00`, now, FOUR_MOSQUES, dev);
    const b = await serve(PAGE, now, FOUR_MOSQUES, dev);
    expect(a.res.headers.get("x-city-cache")).toBe("bypass");
    expect(b.res.headers.get("x-city-cache")).toBe("bypass");
    expect(a.res.headers.get("cache-control")).toBe("no-store");
    expect(a.body).toContain('data-date="2026-12-30"');
    expect(b.body).toContain('data-date="2026-11-10"');
  });

  it("ignores ?now outside dev", async () => {
    const { body } = await serve(`${PAGE}?now=2026-12-30T10:00`, Date.UTC(2026, 10, 11, 11, 0));
    expect(body).toContain('data-date="2026-11-11"');
  });
});
