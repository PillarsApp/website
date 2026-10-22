// Mosque data for a city page. The only module that knows masjid-times' URL
// shapes, JSON and auth header. Callers get a MosqueSection; they never see a
// wire object.

import type { City, LocalDate, MosqueSection } from "./types";

export interface MosqueSource {
  forCity(city: City, date: LocalDate): Promise<MosqueSection>;
}

// For cities without a `mosques` query.
export const noMosques: MosqueSource = {
  async forCity() {
    return { kind: "unavailable", reason: "no-query" };
  },
};
