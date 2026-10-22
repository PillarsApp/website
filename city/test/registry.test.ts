import { describe, expect, it } from "vitest";
import { staticRegistry } from "../src/registry";
import { CITIES } from "../src/cities";
import type { City } from "../src/types";

const london = CITIES[0];
const leeds: City = { country: "uk", slug: "leeds", name: "Leeds", lat: 53.8, lng: -1.55, timezone: "Europe/London", datePublished: "2026-11-01" };
const luton: City = { ...leeds, slug: "luton", name: "Luton", lat: 51.88, lng: -0.42 };
const toronto: City = { country: "ca", slug: "toronto", name: "Toronto", lat: 43.65, lng: -79.38, timezone: "America/Toronto", datePublished: "2026-11-01" };

describe("registry", () => {
  it("ships a valid registry", async () => {
    const reg = staticRegistry();
    expect(await reg.get({ country: "uk", slug: "london" })).toBe(london);
    expect(await reg.get({ country: "ca", slug: "london" })).toBeNull();
  });

  it("rejects a duplicate (country, slug)", () => {
    expect(() => staticRegistry([london, london])).toThrow(/duplicate/);
  });

  it("rejects a bad masjid id, an unknown country and a bad slug", () => {
    const badId = { ...london, mosques: { radiusKm: 5, max: 3, featured: ["plr_xyz" as const] } };
    expect(() => staticRegistry([badId])).toThrow(/masjid id/);
    expect(() => staticRegistry([{ ...london, country: "zz" as never }])).toThrow(/unknown country/);
    expect(() => staticRegistry([{ ...london, slug: "London" }])).toThrow(/bad slug/);
  });

  it("derives nearby from the registry, same country only, nearest first", async () => {
    const reg = staticRegistry([london, leeds, luton, toronto]);
    expect((await reg.nearby(london, 10)).map((c) => c.slug)).toEqual(["luton", "leeds"]);
    expect((await reg.nearby(london, 1)).map((c) => c.slug)).toEqual(["luton"]);
    expect(await staticRegistry([london]).nearby(london, 10)).toEqual([]);
  });
});
