import { describe, expect, it } from "vitest";
import { CITIES, COUNTRIES } from "../src/cities";
import { cityClock } from "../src/render/times";
import { widgetData } from "../src/render/widget";
import { timetableId } from "../src/timetables";
import { faqOf, renderPage } from "./fixtures";
import { BIRMINGHAM, CALCULATED_LONDON, CAMBRIDGE, CHICAGO, GLASGOW, LONDON, NEW_YORK } from "./city-fixtures";
import { BIRMINGHAM_SLICE, LONDON_SLICE } from "./timetable-fixtures";
import type { City, LocalDate } from "../src/types";

const london = cityClock(LONDON, COUNTRIES.uk, LONDON_SLICE);
const calculated = cityClock(LONDON, COUNTRIES.uk);
const hm = (clock: typeof london, d: LocalDate) => { const day = clock.day(d); return { t: day.t.map(clock.hm), hanafi: clock.hm(day.asrHanafi), origin: day.origin }; };

const chicago: City = { ...CHICAGO, standard: CITIES.find((c) => c.slug === "chicago")!.standard };
const cityData = (html: string) => JSON.parse(/<script id="city-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);

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

describe("the page for a published standard", () => {
  it("shows the published day with no estimate marks", () => {
    const { html, text } = renderPage(LONDON, "2026-10-22", LONDON_SLICE);
    expect(html).toContain('<span class="t">06:00</span>');
    expect(html).toContain('<span class="t">07:34</span>');
    expect(text).toContain("Prayer Times based on verified London Unified Prayer Timetable · Published Start Times ·");
    expect(text).toContain("Times follow the London Unified Prayer Timetable");
    expect(html).not.toContain("Today's times are an estimate");
    expect(html).toMatch(/<tr data-date="2026-10-22" class="today" aria-current="date"><th scope="row">Thu 22<span/);
  });

  it("marks the days it had to estimate, in the month table, the week tables and the caption", () => {
    const { html, text } = renderPage(LONDON, "2026-10-30", LONDON_SLICE);
    expect(text).toContain("Prayer Times based on verified London Unified Prayer Timetable · Calculated Until Published ·");
    expect(text).toContain("Today's times are an estimate");
    expect(html).toMatch(/<tr data-date="2026-10-22" class="past"><th scope="row">Thu 22<span class="hj"/);
    expect(html).toMatch(/<tr data-date="2026-10-30" class="today estimate" aria-current="date"><th scope="row">Fri 30<span class="est"/);
    expect(text).toContain("* calculated until London Unified Prayer Timetable publishes these dates.");
    const { text: nextYear } = renderPage(LONDON, "2027-10-22", LONDON_SLICE);
    expect(nextYear).toContain("Estimated From Its 2026 Timetable");
    expect(nextYear).toContain("Today's times are estimated from London Unified Prayer Timetable's 2026 timetable until it publishes 2027.");
  });

  it("still renders, all estimated, when the timetable file is absent", () => {
    const { html, text } = renderPage(BIRMINGHAM, "2026-10-22", null);
    expect(text).toContain("Birmingham Central Mosque · Calculated Until Published ·");
    expect(text).toContain("Today's times are calculated until Birmingham Central Mosque publishes them.");
    expect(html).toMatch(/<tr data-date="2026-10-22" class="today estimate"/);
    expect(cityData(html).timetable).toEqual({});
  });

  it("never talks about angles or the calculation method", () => {
    for (const [city, timetable] of [[LONDON, LONDON_SLICE], [BIRMINGHAM, BIRMINGHAM_SLICE], [GLASGOW, null]] as const) {
      const { text } = renderPage(city, "2026-10-22", timetable);
      // The Qibla bearing is the one legitimate degree sign.
      expect(text.replace(/Qibla from \w+ is \d+°/, ""), city.slug).not.toMatch(/\d+°/);
      expect(text, city.slug).not.toMatch(/Fajr angle|seasonal limits|uses the \w+ .*method|These times use/);
      expect(text, city.slug).toContain(`Where Do ${city.name} Prayer Times Come From?`);
    }
  });

  it("inlines the timetable rows the visitor can step to, with last year's row where this year is missing", () => {
    const data = cityData(renderPage(LONDON, "2027-10-22", LONDON_SLICE).html);
    expect(data).toMatchObject({ standard: "London Unified Prayer Timetable", asrFirst: "Shafi" });
    expect(Object.keys(data.timetable).sort()).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-27", "2026-11-01", "2027-02-28"]);
    expect(data.timetable["2026-10-23"]).toBe("06:02 07:36 12:50 - 16:01 17:54 19:19");
    expect(Object.keys(cityData(renderPage(LONDON, "2026-03-01", LONDON_SLICE).html).timetable)).toEqual([]);
  });
});

describe("the page for a calculated standard", () => {
  it("talks about the method and angles on a gps page, with no estimate marks or dialog estimate", () => {
    const { html, text } = renderPage(CALCULATED_LONDON);
    expect(text).toContain("Moonsighting Committee · Fajr & Isha 18°");
    expect(text).toContain("Times calculated with the Moonsighting Committee method");
    expect(text).toContain("How Are London Prayer Times Calculated?");
    expect(html).not.toContain('class="est"');
    expect(html).not.toContain("estimate");
    expect(cityData(html).timetable).toBeUndefined();
  });

  it("names the standard a calculated city-timetable or mosque page follows", () => {
    expect(renderPage(CITIES.find((c) => c.slug === "houston")!).text).toContain("Times follow the ISGH timetable, calculated with the ISNA (North America) method");
    const { html, text } = renderPage(CAMBRIDGE);
    expect(text).toContain("Times follow Cambridge Central Mosque's timetable, calculated with the Moonsighting Committee method");
    expect(html).toContain("<dt>Standard</dt><dd>Cambridge Central Mosque</dd>");
  });
});

describe("Asr first", () => {
  it("lists the Hanafi Asr first where the city's mosques do, with the toggle on Later", () => {
    const { html } = renderPage(chicago);
    const clock = cityClock(chicago, COUNTRIES.us);
    const day = clock.day("2026-10-22");
    expect(html).toContain(`<span class="asr-toggle is-later" role="group" aria-label="Asr time"><span class="asr-thumb" aria-hidden="true"></span><button type="button" class="asr-opt" data-asr="earlier" aria-pressed="false">Earlier</button><button type="button" class="asr-opt" data-asr="later" aria-pressed="true">Later</button></span></span> <span class="t">${clock.time(day.asrHanafi)}</span>`);
    expect(html).toContain(`Asr ${clock.time(day.asrHanafi)} (Shafi'i ${clock.time(day.t[3])})`);
    expect(cityData(html).asrFirst).toBe("Hanafi");
  });

  it("lists the Shafi'i Asr first elsewhere", () => {
    const { html } = renderPage(NEW_YORK);
    const clock = cityClock(NEW_YORK, COUNTRIES.us);
    const day = clock.day("2026-10-22");
    expect(html).toContain('data-asr="earlier" aria-pressed="true"');
    expect(html).toContain(`Asr ${clock.time(day.t[3])} (Hanafi ${clock.time(day.asrHanafi)})`);
  });

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

describe("the badge dialog", () => {
  const dialog = (html: string) => /<dialog class="std-dialog" id="std-dialog" aria-labelledby="std-title">([\s\S]*?)<\/dialog>/.exec(html)![1];
  const paragraphs = (html: string) => [...dialog(html).matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<\/?strong>/g, ""));

  it("opens from the chip's badge button and closes with a labelled button", () => {
    const { html } = renderPage(LONDON, "2026-10-22", LONDON_SLICE);
    expect(html).toContain('<button type="button" class="chip-badge" id="chip-badge" aria-haspopup="dialog" aria-controls="std-dialog" aria-label="About these times: London Unified Prayer Timetable">');
    expect(dialog(html)).toContain('<button type="button" class="std-close" id="std-close" aria-label="Close">');
    expect(dialog(html)).toMatch(/<h2 class="std-title" id="std-title"><svg class="std-badge"[^>]*>.*?<\/svg><span>London Unified Prayer Timetable<\/span><\/h2>/);
    expect(dialog(html)).toContain('<p class="std-eyebrow">Verified By Pillars</p>');
  });

  it("uses London's own three paragraphs", () => {
    expect(paragraphs(renderPage(LONDON, "2026-10-22", LONDON_SLICE).html)).toEqual([
      "These are the start times of the London Unified Prayer Timetable, which London mosques agreed in 2011. East London Mosque and London Central Mosque (Regent's Park) publish the same times, and the timetable covers everywhere inside the M25.",
      "Fajr and Isha come from observations of dawn and dusk in the UK rather than a fixed sun angle, so other timetables can differ by several minutes, most of all in summer.",
      "Asr shows two start times: the earlier one these mosques list, and the later Hanafi time. Each mosque sets its own jama'ah times.",
    ]);
  });

  it("builds the badge line, the kind paragraph and the jama'ah line for every other kind", () => {
    const luton = CITIES.find((c) => c.slug === "luton")!;
    expect(paragraphs(renderPage(luton).html)).toEqual([
      luton.standard.badge,
      "Luton has no timetable that most of its mosques share, so these times are calculated for central Luton with the Moonsighting Committee method, and checked against the mosques named above on dates through the year.",
      "Each mosque sets its own jama'ah (congregation) times, so check with the mosque you attend.",
    ]);
    expect(paragraphs(renderPage(CAMBRIDGE).html)[1]).toBe("Cambridge Central Mosque's published start times match this calculation within a minute on every day we checked, so this page calculates them.");
    expect(paragraphs(renderPage(CITIES.find((c) => c.slug === "houston")!).html)[1]).toBe("The ISGH timetable is itself an ISNA (North America) calculation, so this page calculates the same times rather than copying the sheet.");
    expect(paragraphs(renderPage(BIRMINGHAM, "2026-10-22", BIRMINGHAM_SLICE).html)).toEqual([
      BIRMINGHAM.standard.badge,
      "Birmingham has no city-wide timetable. These are Birmingham Central Mosque's published start times, loaded from its timetable rather than calculated, because no standard calculation reproduces its seasonal rules.",
      "Each mosque sets its own jama'ah (congregation) times, so check with the mosque you attend.",
    ]);
  });

  it("adds the estimate paragraph before the last one when today is not published", () => {
    const p = paragraphs(renderPage(BIRMINGHAM, "2026-10-23", BIRMINGHAM_SLICE).html);
    expect(p).toHaveLength(4);
    expect(p[2]).toBe("Today's times are calculated until Birmingham Central Mosque publishes them.");
    expect(p[3]).toMatch(/^Each mosque sets/);
  });

  it("answers the timetable FAQ with the same words", () => {
    const html = renderPage(BIRMINGHAM, "2026-10-22", BIRMINGHAM_SLICE).html;
    const faq = faqOf(html).find((q) => q.name === "Which timetable do Birmingham mosques follow?")!;
    expect(faq.acceptedAnswer.text).toBe(paragraphs(html).slice(0, 2).join(" "));
    expect(faqOf(renderPage(NEW_YORK).html).map((q) => q.name)).toContain("Do these times match New York mosques?");
  });
});

describe("every city", () => {
  it("has a standard whose Isha line ends its Isha card, and renders with or without its timetable", () => {
    expect(CITIES).toHaveLength(26);
    for (const city of CITIES) {
      const { html, text } = renderPage(city);
      const ishaCard = /<h2 id="isha">[\s\S]*?<\/details>/.exec(html)![0];
      expect(ishaCard.trim().endsWith(`<p class="standard-isha">${city.standard.isha.replace(/&/g, "&amp;")}</p>\n    </details>`), city.slug).toBe(true);
      if (!city.standard.dialog) expect(text, city.slug).toContain(city.standard.badge);
      expect(html, city.slug).toContain(`<span>${city.standard.name}</span></h2>`);
      if (timetableId(city.standard)) expect(text, city.slug).toContain("Calculated Until Published");
      else expect(html, city.slug).not.toContain("estimate");
    }
  });

  it("publishes from the nine timetables the contract names, or calculates", () => {
    const ids = CITIES.map((c) => timetableId(c.standard)).filter((id) => id !== null).sort();
    expect(ids).toEqual(["birmingham-central", "bradford-central", "chelmsford-cms", "glasgow-central", "leicester-masjid-umar", "london-unified", "manchester-central", "oxford-coms", "watford-central"]);
  });
});
