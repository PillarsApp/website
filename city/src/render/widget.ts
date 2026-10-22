import template from "../../page/widget.html";
import type { City, Country, Instant, LocalDate, Rendered } from "../types";
import { cityClock, PRAYERS } from "./times";
import { fillRegions, jsonInScript } from "./html";

export interface WidgetInput {
  readonly city: City;
  readonly country: Country;
  readonly date: LocalDate;
  readonly now: Instant;
  readonly pageUrl: string;
}

export interface WidgetData {
  readonly name: string;
  readonly place: string;
  readonly url: string;
  readonly clock: 12 | 24;
  readonly timezone: string;
  readonly method: string;
  readonly names: readonly string[];
  readonly days: Readonly<Record<LocalDate, readonly string[]>>;
}

export function widgetData({ city, country, date, pageUrl }: WidgetInput): WidgetData {
  const clock = cityClock(city, country);
  const days: Record<LocalDate, readonly string[]> = {};
  for (let i = -1; i <= 62; i++) {
    const d = clock.addDays(date, i);
    days[d] = clock.day(d).t.map((ms) => clock.hm(ms));
  }
  return {
    name: city.name,
    place: `${city.name}, ${country.short}`,
    url: pageUrl,
    clock: country.clock,
    timezone: city.timezone,
    method: clock.calc.methodLabel,
    names: PRAYERS.map((p) => p.name),
    days,
  };
}

export function renderWidget(input: WidgetInput): Rendered {
  const clock = cityClock(input.city, input.country);
  const data = `<script id="widget-data" type="application/json">\n${jsonInScript(widgetData(input), 0)}\n</script>`;
  return { html: fillRegions(template, { data }), freshUntil: clock.nextMidnight(input.now) };
}
