/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { liveMosqueSource, type MosqueDirectory, pickIds, titleCase, toMosque, parseNearby } from "../src/mosques";
import { createExecutionContext } from "cloudflare:test";
import { handleFetch } from "../src/index";
import { get, testEnv } from "./fixtures";
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
interface Calls { nearby: unknown[]; today: unknown[] }

function fakeDirectory(handlers: { nearby?: (q: unknown) => unknown; today?: (q: any) => unknown }): { directory: MosqueDirectory; calls: Calls } {
  const calls: Calls = { nearby: [], today: [] };
  const directory: MosqueDirectory = {
    async nearby(q) { calls.nearby.push(q); return handlers.nearby!(q); },
    async today(q) { calls.today.push(q); return handlers.today!(q); },
  };
  return { directory, calls };
}

const londonApi = (date: string, rows = FEATURED) => ({
  nearby: () => ({ masjids: rows.map((id) => nearbyRow(id)) }),
  today: (q: { ids: readonly string[] }) => ({ date, masjids: q.ids.map((id) => todayRow(id, date)) }),
});

describe("liveMosqueSource", () => {
  it("answers no-directory without a call when there is no binding", async () => {
    const out = await liveMosqueSource({ directory: undefined }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "no-directory" });
  });

  it("asks nearby for the city, then today for the picked ids and the city-local date", async () => {
    const { directory, calls } = fakeDirectory(londonApi("2026-10-22"));
    const out = await liveMosqueSource({ directory }).forCity(london, "2026-10-22");
    expect(calls.nearby).toEqual([{ lat: london.lat, lng: london.lng, radiusKm: 15, limit: 50 }]);
    expect(calls.today).toEqual([{ ids: FEATURED, date: "2026-10-22" }]);
    expect(out.kind).toBe("live");
    if (out.kind === "live") expect(out.mosques).toHaveLength(10);
  });

  it("parses a directory result into the same Mosque values as before", async () => {
    const { directory } = fakeDirectory({
      nearby: () => ({ masjids: [nearbyRow(FEATURED[0], { name: "EAST LONDON MOSQUE" })] }),
      today: () => ({ date: "2026-10-22", masjids: [todayRow(FEATURED[0], "2026-10-22")] }),
    });
    const out = await liveMosqueSource({ directory }).forCity({ ...london, mosques: { radiusKm: 5, max: 1, featured: [] } }, "2026-10-22");
    expect(out).toEqual({
      kind: "live",
      date: "2026-10-22",
      mosques: [{ name: "East London Mosque", address: "1 High St, E1 1AA", postcode: "E1 1AA", athan: { fajr: "05:50" }, iqamah: { fajr: "06:20", dhuhr: "13:15" }, jummah: ["13:15"] }],
    });
  });

  it("gives up at the deadline when the directory never answers", async () => {
    const never = () => new Promise<never>(() => {});
    const { directory } = fakeDirectory({ nearby: never, today: never });
    const start = performance.now();
    const out = await liveMosqueSource({ directory, deadlineMs: 50 }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "timeout" });
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("shares one deadline across both calls", async () => {
    const slow = (ms: number, v: unknown) => new Promise((r) => setTimeout(() => r(v), ms));
    const api = londonApi("2026-10-22");
    const { directory } = fakeDirectory({ nearby: () => slow(60, api.nearby()), today: () => slow(60, api.today({ ids: FEATURED })) });
    const out = await liveMosqueSource({ directory, deadlineMs: 100 }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "timeout" });
  });

  it("maps a thrown error and a malformed result to error", async () => {
    const thrown = fakeDirectory({ nearby: () => { throw new Error("invalid_coords"); } });
    expect(await liveMosqueSource({ directory: thrown.directory }).forCity(london, "2026-10-22")).toEqual({ kind: "unavailable", reason: "error" });
    for (const bad of [{ nope: 1 }, null, "text"]) {
      const { directory } = fakeDirectory({ nearby: () => bad });
      expect(await liveMosqueSource({ directory }).forCity(london, "2026-10-22")).toEqual({ kind: "unavailable", reason: "error" });
    }
  });

  it("drops one mosque whose day is missing and keeps the rest", async () => {
    const { directory } = fakeDirectory({
      nearby: () => ({ masjids: FEATURED.slice(0, 3).map((id) => nearbyRow(id)) }),
      today: () => ({ date: "2026-10-22", masjids: [todayRow(FEATURED[0], "2026-10-22"), todayRow(FEATURED[1], "2026-10-22", { day: null }), todayRow(FEATURED[2], "2026-10-22")] }),
    });
    const out = await liveMosqueSource({ directory }).forCity(london, "2026-10-22");
    expect(out.kind === "live" && out.mosques).toHaveLength(2);
  });

  it("is unavailable (empty) when every mosque is dropped", async () => {
    const { directory } = fakeDirectory({
      nearby: () => ({ masjids: [nearbyRow(FEATURED[0])] }),
      today: () => ({ date: "2026-10-22", masjids: [todayRow(FEATURED[0], "2026-10-22", { day: null })] }),
    });
    const out = await liveMosqueSource({ directory }).forCity(london, "2026-10-22");
    expect(out).toEqual({ kind: "unavailable", reason: "empty" });
  });
});

describe("city page with a bound directory", () => {
  it("renders the mosque section from the MASJID_TIMES binding", async () => {
    const { directory } = fakeDirectory({
      nearby: () => ({ masjids: [nearbyRow(FEATURED[0], { name: "Bound Directory Mosque" })] }),
      today: (q) => ({ date: q.date, masjids: [todayRow(FEATURED[0], q.date)] }),
    });
    const res = await handleFetch(get("/prayer-times/uk/london/"), testEnv({ MASJID_TIMES: directory as never }), createExecutionContext());
    const html = await res.text();
    expect(html).toContain('id="mosques"');
    expect(html).toContain("Bound Directory Mosque");
  });

  it("renders without the mosque section when the binding is absent", async () => {
    const res = await handleFetch(get("/prayer-times/uk/luton/"), testEnv({ MASJID_TIMES: undefined as never }), createExecutionContext());
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('id="mosques"');
  });
});

describe("pure parts", () => {
  const pool = (ids: string[], extra: Record<string, unknown> = {}) => parseNearby({ masjids: ids.map((id) => nearbyRow(id, extra)) });

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
