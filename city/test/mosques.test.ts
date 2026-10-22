/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { liveMosqueSource, pickIds, titleCase, toMosque, parseNearby } from "../src/mosques";
import { CITIES } from "../src/cities";
import type { MasjidId } from "../src/types";

const london = CITIES[0];
const FEATURED = london.mosques!.featured;
const OTHER = (n: number) => `plr_${n.toString(16).padStart(16, "0")}`;

const nearbyRow = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Mosque ${id.slice(-4)}`, address: "1 High St", zipcode: "E1 1AA", active: true, times_reliable: true, ...extra });
const todayRow = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, inactive: false, times_reliable: true,
  day: { date, athan: { fajr: "05:50", sunrise: null }, iqamah: { fajr: "06:20", dhuhr: "13:15" }, jummah: ["13:15"] },
  ...extra,
});
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });

interface Call { url: URL; headers: Headers }

function fakeFetch(handler: (url: URL, call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = { url, headers: new Headers(init?.headers) };
    calls.push(call);
    if (init?.signal?.aborted) throw init.signal.reason;
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      Promise.resolve(handler(url, call)).then(resolve, reject);
    });
  }) as typeof fetch;
  return { fn, calls };
}

const londonApi = (date: string, rows = FEATURED) =>
  (url: URL) => url.pathname === "/v1/masjids/nearby"
    ? ok({ masjids: rows.map((id) => nearbyRow(id)) })
    : ok({ date, masjids: url.searchParams.get("ids")!.split(",").map((id) => todayRow(id, date)) });

describe("liveMosqueSource", () => {
  it("answers no-credentials without a network call when the secret is absent", async () => {
    const { fn, calls } = fakeFetch(() => ok({}));
    const out = await liveMosqueSource({ baseUrl: "https://m", secret: undefined, fetch: fn }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "no-credentials" });
    expect(calls).toHaveLength(0);
  });

  it("sends the secret and the city-local date and makes two calls for London", async () => {
    const { fn, calls } = fakeFetch(londonApi("2026-10-22"));
    const out = await liveMosqueSource({ baseUrl: "https://m", secret: "s3cret", fetch: fn }).forCity(london, "2026-10-22");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.headers.get("x-app-secret") === "s3cret")).toBe(true);
    expect(calls[0].url.searchParams.get("radius_km")).toBe("15");
    expect(calls[1].url.searchParams.get("date")).toBe("2026-10-22");
    expect(calls[1].url.searchParams.get("ids")).toBe(FEATURED.join(","));
    expect(out.kind).toBe("live");
    if (out.kind === "live") expect(out.mosques).toHaveLength(10);
  });

  it("gives up at the deadline", async () => {
    const { fn } = fakeFetch(() => new Promise<Response>(() => {}));
    const start = performance.now();
    const out = await liveMosqueSource({ baseUrl: "https://m", secret: "s", deadlineMs: 50, fetch: fn }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("treats a 401, a 500 and malformed JSON as unavailable", async () => {
    for (const res of [new Response("no", { status: 401 }), new Response("no", { status: 500 }), new Response("{not json"), ok({ nope: 1 })]) {
      const { fn } = fakeFetch(() => res.clone());
      const out = await liveMosqueSource({ baseUrl: "https://m", secret: "s", fetch: fn }).forCity(london, "2026-10-22");
      expect(out).toEqual({ kind: "unavailable", reason: "error" });
    }
  });

  it("drops one mosque whose day is missing and keeps the rest", async () => {
    const { fn } = fakeFetch((url) => url.pathname === "/v1/masjids/nearby"
      ? ok({ masjids: FEATURED.slice(0, 3).map((id) => nearbyRow(id)) })
      : ok({ date: "2026-10-22", masjids: [todayRow(FEATURED[0], "2026-10-22"), todayRow(FEATURED[1], "2026-10-22", { day: null }), todayRow(FEATURED[2], "2026-10-22")] }));
    const out = await liveMosqueSource({ baseUrl: "https://m", secret: "s", fetch: fn }).forCity(london, "2026-10-22");
    expect(out.kind === "live" && out.mosques).toHaveLength(2);
  });

  it("is unavailable (empty) when every mosque is dropped", async () => {
    const { fn } = fakeFetch((url) => url.pathname === "/v1/masjids/nearby"
      ? ok({ masjids: [nearbyRow(FEATURED[0])] })
      : ok({ date: "2026-10-22", masjids: [todayRow(FEATURED[0], "2026-10-22", { day: null })] }));
    const out = await liveMosqueSource({ baseUrl: "https://m", secret: "s", fetch: fn }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "empty" });
  });
});

describe("pure parts", () => {
  const pool = (ids: string[], extra: Record<string, unknown> = {}) => parseNearby({ data: { masjids: ids.map((id) => nearbyRow(id, extra)) } });

  it("puts featured first, fills the nearest others to max, never beyond max", () => {
    const others = [OTHER(1), OTHER(2), OTHER(3)];
    const ids = pickIds(pool([others[0], FEATURED[1], others[1], FEATURED[0], others[2]]), { radiusKm: 5, max: 4, featured: [FEATURED[0], FEATURED[1]] });
    expect(ids).toEqual([FEATURED[0], FEATURED[1], others[0], others[1]] as MasjidId[]);
  });

  it("skips inactive and unreliable mosques", () => {
    expect(pickIds(pool([OTHER(1)], { active: false }), { radiusKm: 5, max: 3, featured: [] })).toEqual([]);
    expect(pickIds(pool([OTHER(1)], { times_reliable: false }), { radiusKm: 5, max: 3, featured: [] })).toEqual([]);
  });

  it("joins the street and postcode once, and title-cases only shouting names", () => {
    const [meta] = pool([OTHER(1)], { name: "EAST LONDON MOSQUE" });
    const row = { id: OTHER(1), inactive: false, reliable: true, day: { date: "2026-10-22", athan: {}, iqamah: {}, jummah: [] } };
    expect(toMosque(meta, row, "2026-10-22")).toMatchObject({ name: "East London Mosque", address: "1 High St, E1 1AA" });
    const [withPostcode] = pool([OTHER(1)], { address: "1 High St, E1 1AA" });
    expect(toMosque(withPostcode, row, "2026-10-22")?.address).toBe("1 High St, E1 1AA");
    expect(titleCase("Al-Negashi Mosque & Centre")).toBe("Al-Negashi Mosque & Centre");
    expect(titleCase("MUSLIM WELFARE HOUSE")).toBe("Muslim Welfare House");
  });

  it("drops a mosque whose row is for another date", () => {
    const [meta] = pool([OTHER(1)]);
    const row = { id: OTHER(1), inactive: false, reliable: true, day: { date: "2026-10-21", athan: {}, iqamah: {}, jummah: [] } };
    expect(toMosque(meta, row, "2026-10-22")).toBeNull();
  });
});

describe("no placeholders in the Worker", () => {
  const sources = import.meta.glob("../src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

  it("keeps src/ independent of test/", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/from\s+["'][./]*\/test\//);
    }
  });

});
