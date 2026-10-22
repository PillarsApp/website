import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../src/cities";
import { plainText } from "../src/render/html";
import { renderCityPage } from "../src/render/page";
import { cityClock } from "../src/render/times";
import { linksFor } from "../src/routes";
import { DOWN } from "./fixtures";
import { CHICAGO, HOUSTON, ISNA_GPS, LONDON, LOS_ANGELES, NEW_YORK, SEATTLE, TORONTO } from "./city-fixtures";
import type { City, LocalDate } from "../src/types";

function page(city: City, date: LocalDate = "2026-10-22") {
  const country = COUNTRIES[city.country];
  const now = cityClock(city, country).localInstant(date, 12, 0);
  const html = renderCityPage({ city, country, timetable: null, date, now, mosques: DOWN, links: linksFor(city, []), audience: "public" }).html;
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
  return { html, text: plainText(visible).replace(/\s+/g, " ") };
}

function faq(city: City, date?: LocalDate): { name: string; acceptedAnswer: { text: string } }[] {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page(city, date).html)![1])["@graph"];
  return ld.find((n: { "@type": string }) => n["@type"] === "FAQPage").mainEntity;
}

function faqAnswer(city: City, question: string, date?: LocalDate): string {
  const hit = faq(city, date).find((q) => q.name.startsWith(question));
  expect(hit, `FAQ "${question}" on ${city.slug}`).toBeTruthy();
  return hit!.acceptedAnswer.text;
}

describe("time zone abbreviations", () => {
  it.each([
    [NEW_YORK, "EST or EDT"],
    [TORONTO, "EST or EDT"],
    [HOUSTON, "CST or CDT"],
    [CHICAGO, "CST or CDT"],
    [LOS_ANGELES, "PST or PDT"],
    [LONDON, "GMT or BST"],
  ])("%s asks about %s", (city, pair) => {
    for (const date of ["2026-01-20", "2026-07-20"] as const) {
      expect(faq(city, date).map((q) => q.name), `${city.slug} ${date}`).toContain(`Are these times in ${pair}?`);
    }
  });

  it("answers with the abbreviation now in force and the one after the next change", () => {
    const answer = faqAnswer(NEW_YORK, "Are these times in", "2026-10-22");
    expect(answer).toContain("currently EDT");
    expect(answer).toContain("Sunday 1 November 2026");
    expect(answer).toContain("the times are in EST");
  });

  it("never shows GMT or BST on a US or Canadian page, caption included", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO, CHICAGO, LOS_ANGELES, SEATTLE]) {
      for (const date of ["2026-01-20", "2026-10-22", "2026-10-30"] as const) {
        const { html, text } = page(city, date);
        expect(text, `${city.slug} ${date}`).not.toMatch(/GMT|BST|British|Greenwich/);
        expect(html, `${city.slug} ${date}`).not.toMatch(/GMT|BST|British Summer/);
      }
    }
    expect(page(NEW_YORK).text).toContain("Eastern Daylight Time (EDT)");
  });

  it("still says GMT and BST in London", () => {
    expect(page(LONDON).text).toContain("British Summer Time (BST)");
  });
});

describe("time zone wording", () => {
  it("names the city, not the country, in the timetable note and the time-zone answer", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO, LONDON]) {
      const { text } = page(city);
      expect(text, city.slug).toContain(`${city.name} local time.`);
      expect(text, city.slug).toContain(`All times are ${city.name} local time`);
      expect(text, city.slug).not.toMatch(/(United States|Canada|United Kingdom) local time/);
    }
  });
});

describe("midsummer Isha answer", () => {
  const ISHA_Q = "Why is Isha so late in";
  const ANCHORAGE: City = { country: "us", slug: "anchorage", name: "Anchorage", lat: 61.2181, lng: -149.9003, timezone: "America/Anchorage", datePublished: "2026-10-22", standard: ISNA_GPS };

  it("does not say the sky stays light where the sun does reach the Isha angle", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO]) {
      const answer = faqAnswer(city, ISHA_Q);
      expect(answer, city.slug).not.toMatch(/far enough north|barely gets fully dark|seasonal limits/);
      expect(answer, city.slug).toContain("sunset comes late");
      expect(answer, city.slug).toMatch(/Fajr is at .*, Maghrib at .* and Isha at /);
    }
  });

  it("keeps the dark-sky claim for London, with its seasonal limits", () => {
    const answer = faqAnswer(LONDON, ISHA_Q);
    expect(answer).toContain("far enough north that the sky barely gets fully dark around midsummer");
    expect(answer).toContain("applies seasonal limits");
  });

  it("makes the dark-sky claim for a far-north ISNA city but never mentions seasonal limits", () => {
    const answer = faqAnswer(ANCHORAGE, ISHA_Q);
    expect(answer).toContain("far enough north");
    expect(answer).not.toContain("seasonal limits");
  });

  it("agrees with the Isha card about whether the sun reaches the angle", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO, LONDON, ANCHORAGE]) {
      const { text } = page(city);
      const cardSaysNever = text.includes("the sun never sinks");
      expect(faqAnswer(city, ISHA_Q).includes("far enough north"), city.slug).toBe(cardSaysNever);
    }
  });

  it("names seasonal limits only on pages whose method has them", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO, ANCHORAGE]) {
      expect(page(city).text, city.slug).not.toMatch(/seasonal limits|Moonsighting/);
    }
    expect(page(LONDON).text).toContain("seasonal limits");
  });
});

describe("other calculation methods", () => {
  it("never presents ISNA as another method on a page that uses ISNA", () => {
    for (const city of [NEW_YORK, HOUSTON, TORONTO]) {
      const { text } = page(city);
      expect(text, city.slug).toContain("ISNA (North America) method");
      expect(text, city.slug).not.toMatch(/ISNA puts|ISNA at 15°|ISNA 15°/);
      expect(text, city.slug).toContain("put Fajr at 18°, which gives an earlier time than the 15° used here");
      expect(text, city.slug).toContain("the Muslim World League uses 17° and Karachi 18°, against 15° here");
    }
  });

  it("still lists ISNA as another method on London's page", () => {
    const { text } = page(LONDON);
    expect(text).toContain("ISNA puts Fajr at 15°");
    expect(text).toContain("ISNA 15°");
  });
});
