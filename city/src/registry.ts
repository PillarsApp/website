import type { City, CityRef, Country, CountrySlug } from "./types";
import { CITIES, COUNTRIES } from "./cities";

export interface CityRegistry {
  get(ref: CityRef): Promise<City | null>;
  country(slug: string): Country | null;
  countries(): readonly Country[];
  inCountry(country: CountrySlug): Promise<readonly City[]>;
  nearby(city: City, n: number): Promise<readonly City[]>;
}

export const MASJID_ID_RE = /^plr_[0-9a-f]{16}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_MOSQUES = 15;

export function isCountrySlug(s: string): s is CountrySlug {
  return Object.prototype.hasOwnProperty.call(COUNTRIES, s);
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const NEARBY_MAX_KM = 170;

const keyOf = (ref: CityRef) => `${ref.country}/${ref.slug}`;

function validate(city: City): void {
  const where = keyOf(city);
  if (!isCountrySlug(city.country)) throw new Error(`${where}: unknown country`);
  if (!SLUG_RE.test(city.slug)) throw new Error(`${where}: bad slug`);
  const q = city.mosques;
  if (!q) return;
  if (!Number.isInteger(q.max) || q.max < 1 || q.max > MAX_MOSQUES) throw new Error(`${where}: mosques.max must be 1..${MAX_MOSQUES}`);
  for (const id of q.featured) if (!MASJID_ID_RE.test(id)) throw new Error(`${where}: bad masjid id ${id}`);
}

export function staticRegistry(cities: readonly City[] = CITIES): CityRegistry {
  const byKey = new Map<string, City>();
  for (const city of cities) {
    validate(city);
    if (byKey.has(keyOf(city))) throw new Error(`${keyOf(city)}: duplicate city`);
    byKey.set(keyOf(city), city);
  }
  return {
    async get(ref) {
      return byKey.get(keyOf(ref)) ?? null;
    },
    country(slug) {
      return isCountrySlug(slug) ? COUNTRIES[slug] : null;
    },
    countries() {
      return Object.values(COUNTRIES);
    },
    async inCountry(country) {
      return cities.filter((c) => c.country === country).sort((a, b) => a.name.localeCompare(b.name));
    },
    async nearby(city, n) {
      return cities
        .filter((c) => c.country === city.country && c.slug !== city.slug)
        .map((c) => ({ c, km: haversineKm(city, c) }))
        .filter((x) => x.km <= NEARBY_MAX_KM)
        .sort((a, b) => a.km - b.km)
        .slice(0, n)
        .map((x) => x.c);
    },
  };
}
