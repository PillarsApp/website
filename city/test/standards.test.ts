import { describe, expect, it } from "vitest";
import { CITIES, COUNTRIES } from "../src/cities";
import { cityClock } from "../src/render/times";
import { widgetData } from "../src/render/widget";
import { timetableId } from "../src/timetables";
import { CHICAGO, LONDON } from "./city-fixtures";
import { LONDON_SLICE } from "./timetable-fixtures";
import type { City, LocalDate } from "../src/types";

const london = cityClock(LONDON, COUNTRIES.uk, LONDON_SLICE);
const calculated = cityClock(LONDON, COUNTRIES.uk);
const hm = (clock: typeof london, d: LocalDate) => { const day = clock.day(d); return { t: day.t.map(clock.hm), hanafi: clock.hm(day.asrHanafi), origin: day.origin }; };

const chicago: City = { ...CHICAGO, standard: CITIES.find((c) => c.slug === "chicago")!.standard };

describe("a published standard's days", () => {
  it("uses the timetable's row as published, Shafi'i Asr in t[3] and Hanafi Asr apart", () => {
    expect(hm(london, "2026-10-22")).toEqual({ t: ["06:00", "07:34", "12:50", "15:21", "17:56", "19:21"], hanafi: "16:03", origin: "published" });
  });

  it("fills a null column from the calculation and keeps the rest published", () => {
    const day = hm(london, "2026-10-23");
    expect(day.origin).toBe("published");
    expect(day.t[3]).toBe(hm(calculated, "2026-10-23").t[3]);
    expect(day.t[0]).toBe("06:02");
    expect(day.hanafi).toBe("16:01");
  });

  it("carries last year's row forward at the same solar time across a clock change that moved", () => {
    // London leaves BST on 25 Oct 2026 and on 31 Oct 2027: 27 Oct is GMT in 2026 and BST in 2027.
    expect(hm(london, "2027-10-27")).toEqual({ t: ["06:10", "07:43", "12:50", "15:12", "17:46", "19:12"], hanafi: "15:54", origin: "last-year" });
    expect(hm(london, "2027-10-24").t[0]).toBe("06:04");
    expect(hm(london, "2027-11-01").t[0]).toBe("05:18");
  });

  it("reads 28 Feb for a 29 Feb that last year did not have", () => {
    expect(hm(london, "2028-02-29")).toMatchObject({ t: ["05:08", "06:49", "12:14", "15:03", "17:31", "18:58"], origin: "last-year" });
  });

  it("falls back to the calculation when neither year is published", () => {
    expect(hm(london, "2026-06-21")).toEqual({ ...hm(calculated, "2026-06-21"), origin: "calculated" });
  });

  it("is always calculated without a timetable", () => {
    expect(calculated.day("2026-10-22").origin).toBe("calculated");
  });
});

describe("the widget", () => {
  it("gives the widget the same times and Asr as the page", () => {
    const widget = widgetData({ city: chicago, country: COUNTRIES.us, timetable: null, date: "2026-10-22", now: 0, pageUrl: "x" });
    const clock = cityClock(chicago, COUNTRIES.us);
    const day = clock.day("2026-10-22");
    expect(widget.days["2026-10-22"][3]).toBe(clock.hm(day.asrHanafi));
    expect(widget.source).toBe("ISNA method");
    const published = widgetData({ city: LONDON, country: COUNTRIES.uk, timetable: LONDON_SLICE, date: "2026-10-22", now: 0, pageUrl: "x" });
    expect(published.days["2026-10-22"]).toEqual(["06:00", "07:34", "12:50", "15:21", "17:56", "19:21"]);
    expect(published.source).toBe("London Unified Prayer Timetable");
  });
});

describe("every city", () => {
  it("publishes from the nine timetables the contract names, or calculates", () => {
    const ids = CITIES.map((c) => timetableId(c.standard)).filter((id) => id !== null).sort();
    expect(ids).toEqual(["birmingham-central", "bradford-central", "chelmsford-cms", "glasgow-central", "leicester-masjid-umar", "london-unified", "manchester-central", "oxford-coms", "watford-central"]);
  });
});
