import { describe, expect, it } from "vitest";
import { CITIES, COUNTRIES } from "../src/cities";
import { plainText } from "../src/render/html";
import { renderCityPage } from "../src/render/page";
import { cityClock } from "../src/render/times";
import { linksFor } from "../src/routes";
import { DOWN } from "./fixtures";
import type { LocalDate } from "../src/types";

function page(slug: string, date: LocalDate = "2026-10-22") {
  const city = CITIES.find((c) => c.slug === slug)!;
  const country = COUNTRIES[city.country];
  const now = cityClock(city, country).localInstant(date, 12, 0);
  const html = renderCityPage({ city, country, date, now, mosques: DOWN, links: linksFor(city, []), audience: "public" }).html;
  const seo = /<section class="seo"[\s\S]*<\/section>/.exec(html)![0];
  return { html, text: plainText(seo).replace(/\s+/g, " ") };
}

function faq(slug: string, date?: LocalDate): { name: string; acceptedAnswer: { text: string } }[] {
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page(slug, date).html)![1])["@graph"];
  return ld.find((n: { "@type": string }) => n["@type"] === "FAQPage").mainEntity;
}

function faqAnswer(slug: string, question: string, date?: LocalDate): string {
  const hit = faq(slug, date).find((q) => q.name.startsWith(question));
  expect(hit, `FAQ "${question}" on ${slug}`).toBeTruthy();
  return hit!.acceptedAnswer.text;
}

describe("time zone wording", () => {
  it("names the city, not the country, in the timetable note and the time-zone answer", () => {
    for (const slug of ["new-york", "houston", "toronto", "london"]) {
      const { text } = page(slug);
      const name = CITIES.find((c) => c.slug === slug)!.name;
      expect(text, slug).toContain(`${name} local time.`);
      expect(text, slug).not.toMatch(/(United States|Canada|United Kingdom) local time/);
    }
  });
});
