import { describe, expect, it } from "vitest";
import { CITIES } from "../src/cities";
import { TIMETABLE_FILES, timetableFor, timetableId } from "../src/timetables";

// Runs against whatever data/timetables/*.json files the build found: none, some or all.
describe("the bundled timetable files", () => {
  it("belong to a city of the registry and share its zone", () => {
    for (const [id, t] of Object.entries(TIMETABLE_FILES)) {
      const city = CITIES.find((c) => timetableId(c.standard) === id);
      expect(city, `${id} is a timetable no city uses`).toBeTruthy();
      expect(t.zone, id).toBe(city!.timezone);
      expect(t.id, id).toBe(id);
      expect(timetableFor(city!)).toBe(t);
    }
  });

  it("list every day with seven HH:MM or null columns in ascending order", () => {
    for (const t of Object.values(TIMETABLE_FILES)) {
      const dates = Object.keys(t.days);
      expect(dates, t.id).toEqual([...dates].sort());
      for (const [d, row] of Object.entries(t.days)) {
        expect(row, `${t.id} ${d}`).toHaveLength(7);
        for (const v of row) if (v !== null) expect(v, `${t.id} ${d}`).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });
});
