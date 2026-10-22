import template from "../../page/widget.html";
import type { City, Country, Instant, LocalDate, Rendered, Timetable } from "../types";
import { cityClock, PRAYERS } from "./times";
import { fillRegions, jsonInScript } from "./html";

export interface WidgetInput {
  readonly city: City;
  readonly country: Country;
  readonly timetable: Timetable | null;
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
  readonly source: string;
  readonly names: readonly string[];
  readonly days: Readonly<Record<LocalDate, readonly string[]>>;
}

// No Asr toggle here, so the widget shows the Asr the city lists first.
export function widgetData({ city, country, timetable, date, pageUrl }: WidgetInput): WidgetData {
  const clock = cityClock(city, country, timetable);
  const days: Record<LocalDate, readonly string[]> = {};
  for (let i = -1; i <= 62; i++) {
    const d = clock.addDays(date, i);
    const day = clock.day(d);
    const t = city.standard.asrFirst === "Hanafi" ? [day.t[0], day.t[1], day.t[2], day.asrHanafi, day.t[4], day.t[5]] : day.t;
    days[d] = t.map((ms) => clock.hm(ms));
  }
  return {
    name: city.name,
    place: `${city.name}, ${country.short}`,
    url: pageUrl,
    clock: country.clock,
    timezone: city.timezone,
    source: city.standard.name,
    names: PRAYERS.map((p) => p.name),
    days,
  };
}

export function renderWidget(input: WidgetInput): Rendered {
  const clock = cityClock(input.city, input.country, input.timetable);
  const data = `<script id="widget-data" type="application/json">\n${jsonInScript(widgetData(input), 0)}\n</script>`;
  return { html: fillRegions(template, { data }), freshUntil: clock.nextMidnight(input.now) };
}
