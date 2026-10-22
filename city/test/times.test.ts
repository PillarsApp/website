import { describe, expect, it } from "vitest";
import { cityClock } from "../src/render/times";
import { CITIES, COUNTRIES } from "../src/cities";
import type { City, LocalDate } from "../src/types";
import { ISNA_GPS } from "./city-fixtures";

const london = cityClock(CITIES[0], COUNTRIES.uk);
const noonLondon = Date.UTC(2026, 9, 22, 11, 0);

describe("London clock", () => {
  it("computes 2026-10-22 as the committed build did, with no timetable", () => {
    const day = london.day("2026-10-22");
    expect(day.t.map((t) => london.time(t))).toEqual(["06:00", "07:36", "12:50", "15:20", "17:56", "19:17"]);
    expect(london.time(day.asrHanafi)).toBe("16:02");
  });

  it("names the date, the Hijri date and the zone", () => {
    expect(london.longDate("2026-10-22")).toBe("Thursday 22 October 2026");
    expect(london.hijri("2026-10-22").long).toBe("11 Jumada al-Awwal 1448");
    expect(london.zoneAbbr(noonLondon)).toBe("BST");
    expect(london.zoneLong(noonLondon)).toBe("British Summer Time");
  });

  it("finds the clock change after today", () => {
    expect(london.nextClockChange("2026-10-22")).toBe("2026-10-25");
    expect(london.nextClockChange("2026-10-25")).toBe("2027-03-28");
  });

  it("ends the day at local midnight across the 25-hour day", () => {
    expect(london.nextMidnight(Date.UTC(2026, 9, 24, 12))).toBe(Date.UTC(2026, 9, 24, 23));
    expect(london.nextMidnight(Date.UTC(2026, 9, 25, 12))).toBe(Date.UTC(2026, 9, 26, 0));
  });

  it("reads today in the city's zone, not UTC", () => {
    expect(london.today(Date.UTC(2026, 9, 22, 23, 30))).toBe("2026-10-23");
  });
});

describe("other zones and clocks", () => {
  const dubai: City = { country: "us", slug: "dubai", name: "Dubai", lat: 25.2, lng: 55.27, timezone: "Asia/Dubai", datePublished: "2026-10-22", calc: { method: "Dubai", madhab: "Shafi", highLatitudeRule: "TwilightAngle" }, standard: ISNA_GPS };
  const dubaiClock = cityClock(dubai, COUNTRIES.us);

  it("has no clock change in a zone without DST and finds it fast", () => {
    const start = performance.now();
    expect(dubaiClock.nextClockChange("2026-10-22")).toBeNull();
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("formats 12-hour countries like city.js, keeping its 12:00 quirk", () => {
    const day: LocalDate = "2026-10-22";
    const t = dubaiClock.day(day).t[2];
    expect(dubaiClock.time(t)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    expect(dubaiClock.tableTime(t)).toMatch(/^\d{1,2}:\d{2}$/);
    expect(dubaiClock.wallClock("12:00", false)).toBe("12:00");
    expect(dubaiClock.wallClock("13:05", false)).toBe("1:05 PM");
    expect(dubaiClock.wallClock(undefined)).toBe("–");
  });

  it("represents custom angles without the renderer reading adhan", () => {
    const custom = cityClock({ ...dubai, calc: { method: "Custom", fajrAngle: 18, ishaAngle: 17, madhab: "Shafi", highLatitudeRule: "TwilightAngle" } }, COUNTRIES.us);
    expect(custom.calc.fajrAngle).toBe(18);
    expect(custom.calc.ishaAngle).toBe(17);
  });
});
