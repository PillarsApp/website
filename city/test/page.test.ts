import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import template from "../page/template.html";
import { regionNames } from "../src/render/html";
import { cityClock } from "../src/render/times";
import { CITIES, COUNTRIES } from "../src/cities";
import { renderCityPage, type TemplateRegion } from "../src/render/page";
import { staticRegistry } from "../src/registry";
import { linksFor } from "../src/routes";
import { timetableFor } from "../src/timetables";
import { DOWN, FOUR_MOSQUES, LONDON_NOON_OCT_22, deps, fetchWith } from "./fixtures";
import type { MosqueSection } from "../src/types";

const london = CITIES[0];
const londonToday = cityClock(london, COUNTRIES.uk).today(Date.now());

function ldGraph(html: string): Record<string, any>[] {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)!;
  return JSON.parse(m[1])["@graph"];
}

async function render(section: MosqueSection = DOWN) {
  const res = await fetchWith("/prayer-times/uk/london/", deps(section), { ENVIRONMENT: "dev" });
  return { res, html: await res.text() };
}

describe("London page", () => {
  it("shows a crawler today's times in the HTML, with data and schema that parse", async () => {
    const res = await SELF.fetch("https://thepillarsapp.com/prayer-times/uk/london/");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<title>London Prayer Times Today");
    expect(html).toContain(`id="answer" data-date="${londonToday}"`);
    const data = JSON.parse(/<script id="city-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(data).toMatchObject({ name: "London", timezone: "Europe/London", method: "MoonsightingCommittee" });
    const graph = ldGraph(html);
    expect(graph.find((n) => n["@type"] === "Organization")?.["@id"]).toBe("https://thepillarsapp.com/#org");
    expect(graph.find((n) => n["@type"] === "FAQPage")?.mainEntity.length).toBeGreaterThan(8);
  });

  it("states the London numbers for 2026-10-22", async () => {
    const { html } = await render();
    expect(html).toContain('<span class="t">06:00</span>');
    expect(html).toContain("11 Jumada al-Awwal 1448");
    expect(html).toContain("British Summer Time (BST)");
    expect(html).toContain("@font-face{font-family:'Poppins'");
  });

  it("takes every region from the renderer and none from elsewhere", () => {
    const expected: Record<TemplateRegion, true> = {
      html: true, head: true, css: true, preload: true, chip: true, dialog: true, date: true, "list-open": true, list: true, caption: true, seo: true, banner: true, scripts: true, analytics: true,
    };
    expect([...regionNames(template)].sort()).toEqual(Object.keys(expected).sort());
  });

  it("is noindex outside production and indexable in production", async () => {
    expect((await render()).html).toContain('<meta name="robots" content="noindex">');
    const input = { city: london, country: COUNTRIES.uk, timetable: null, date: "2026-10-22" as const, now: LONDON_NOON_OCT_22, mosques: DOWN, links: linksFor(london, []), audience: "public" as const };
    expect(renderCityPage(input).html).not.toContain('name="robots"');
  });

  it("sends analytics only to the public audience, and keeps the preview noindex", async () => {
    const PLAUSIBLE = "plausible.io/js/pa-Xhisz5hgVg6bE5rUMU2-j.js";
    const POSTHOG_KEY = "phc_qHqhPXTDi7US4eoZ8iS5rg4mvjgxjFPM5QVFDHqBKvGn";
    const otherDay = deps(DOWN, LONDON_NOON_OCT_22 + 3 * 86_400_000);
    const prod = await (await fetchWith("/prayer-times/uk/london/", otherDay, { ENVIRONMENT: "production" })).text();
    expect(prod).toContain(PLAUSIBLE);
    expect(prod).toContain(POSTHOG_KEY);
    expect(prod).not.toContain('name="robots"');
    for (const environment of ["dev", "staging"]) {
      const html = await (await fetchWith("/prayer-times/uk/london/", deps(DOWN), { ENVIRONMENT: environment })).text();
      expect(html, environment).not.toContain("plausible");
      expect(html, environment).not.toContain(POSTHOG_KEY);
      expect(html, environment).toContain('<meta name="robots" content="noindex">');
    }
  });

  it("answers an unknown city or country with the Worker's 404", async () => {
    for (const path of ["/prayer-times/uk/narnia/", "/prayer-times/zz/london/", "/prayer-times/ca/london/"]) {
      expect((await fetchWith(path, deps(DOWN))).status, path).toBe(404);
    }
  });

  it("omits the nearby card when no city is near", () => {
    const input = { city: london, country: COUNTRIES.uk, timetable: null, date: "2026-10-22" as const, now: LONDON_NOON_OCT_22, mosques: DOWN, links: linksFor(london, []), audience: "public" as const };
    expect(renderCityPage(input).html).not.toContain('class="nearby"');
  });

  // Parked with the nearby-cities card (SHOW_NEARBY_CARD in src/render/page.ts); unskip when it returns.
  it.skip("lists nearby cities from the registry when the country has more", () => {
    const luton = { ...london, slug: "luton", name: "Luton", lat: 51.88, lng: -0.42 };
    const input = { city: london, country: COUNTRIES.uk, timetable: null, date: "2026-10-22" as const, now: LONDON_NOON_OCT_22, mosques: DOWN, links: linksFor(london, [luton]), audience: "public" as const };
    const html = renderCityPage(input).html;
    expect(html).toContain('<li><a href="/prayer-times/uk/luton/">Luton</a></li>');
  });
});

describe("mosques in the page", () => {
  it("renders live mosques as plain text with no link, and none in the schema's url", async () => {
    const { html } = await render(FOUR_MOSQUES);
    expect(html).toContain('<h3>Example Masjid A</h3>');
    expect(html).not.toContain("/mosques/");
    const list = ldGraph(html).find((n) => n["@type"] === "ItemList")!;
    expect(list.itemListElement).toHaveLength(4);
    expect(list.itemListElement[0].item.url).toBeUndefined();
  });

  it("renders no section, placeholder or tool when mosques are unavailable", async () => {
    const { html } = await render(DOWN);
    expect(html).not.toContain('id="mosques"');
    expect(html).not.toContain("Placeholder");
    expect(html).not.toContain("mosquesDate");
  });

  it("cannot be broken out of its script block by a hostile mosque name", async () => {
    const evil: MosqueSection = { kind: "live", date: "2026-10-22", mosques: [{ ...FOUR_MOSQUES.kind === "live" ? FOUR_MOSQUES.mosques[0] : (null as never), name: '</script><script>alert(1)</script>' }] };
    const { html } = await render(evil);
    expect(html).not.toContain("<script>alert(1)");
    const data = /<script id="city-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
    expect(JSON.parse(data).mosques[0].name).toBe("</script><script>alert(1)</script>");
  });
});

describe("the registry's cities all render", () => {
  it("renders every city in the data", async () => {
    const reg = staticRegistry();
    for (const c of CITIES) {
      const country = reg.country(c.country)!;
      const input = { city: c, country, timetable: timetableFor(c), date: cityClock(c, country).today(Date.now()), now: Date.now(), mosques: DOWN, links: linksFor(c, []), audience: "preview" as const };
      expect(renderCityPage(input).html).toContain(`${c.name} Prayer Times`);
    }
  });
});
