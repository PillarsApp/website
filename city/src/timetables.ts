import type { City, Standard, Timetable, TimetableId } from "./types";
import { TIMETABLES } from "./generated/timetables";

export const TIMETABLE_FILES: Readonly<Partial<Record<TimetableId, Timetable>>> = TIMETABLES;

export function timetableId(standard: Standard): TimetableId | null {
  return standard.kind === "gps" ? null : standard.timetable;
}

export function timetableFor(city: City): Timetable | null {
  const id = timetableId(city.standard);
  return (id && TIMETABLE_FILES[id]) ?? null;
}
