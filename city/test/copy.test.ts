import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../src/cities";
import { plainText } from "../src/render/html";
import { renderCityPage } from "../src/render/page";
import { cityClock } from "../src/render/times";
import { linksFor } from "../src/routes";
import { DOWN } from "./fixtures";
import { CHICAGO, HOUSTON, LONDON, LOS_ANGELES, NEW_YORK, SEATTLE, TORONTO } from "./city-fixtures";
import type { City, LocalDate } from "../src/types";

function page(city: City, date: LocalDate = "2026-10-22") {
  const country = COUNTRIES[city.country];
  const now = cityClock(city, country).localInstant(date, 12, 0);
  const html = renderCityPage({ city, country, date, now, mosques: DOWN, links: linksFor(city, []), audience: "public" }).html;
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
