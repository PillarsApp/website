// Mosque data for a city page. The only module that knows masjid-times' URL
// shapes, JSON and auth header. Callers get a MosqueSection; they never see a
// wire object.
//
// Protocol (two round trips, bounded by one deadline):
//   1. GET /v1/masjids/nearby?lat&lng&radius_km&limit=50       (pool + addresses)
//   2. GET /v1/timetables/today?ids=<up to 15>&date=<city-local>  (one call, all mosques)
// Featured ids go first, then the nearest reliable others up to query.max. Any
// failure, non-2xx, bad shape or the deadline gives "unavailable". Nothing in
// this module can construct a Mosque that did not come from the API.

import type { City, LocalDate, MasjidId, Mosque, MosqueQuery, MosqueSection, PrayerKey, WallClock } from "./types";
import { MASJID_ID_RE } from "./registry";

export interface MosqueSource {
  forCity(city: City, date: LocalDate): Promise<MosqueSection>;
}

// For cities without a `mosques` query.
export const noMosques: MosqueSource = {
  async forCity() {
    return { kind: "unavailable", reason: "no-query" };
  },
};

export interface LiveMosqueSourceOptions {
  readonly baseUrl: string;
  readonly secret: string | undefined; // undefined: every call answers "no-credentials"
  readonly deadlineMs?: number; // the page must not wait on mosques
  readonly fetch?: typeof fetch; // injected in tests
}

const DEFAULT_DEADLINE_MS = 2500;
const POOL_SIZE = 50;

// Without a secret there is no network call and no mosque: there is no code
// path from "no data" to "some mosques".
export function liveMosqueSource(opts: LiveMosqueSourceOptions): MosqueSource {
  const doFetch = opts.fetch ?? fetch;
  return {
    async forCity(city, date) {
      const query = city.mosques;
      if (!query) return { kind: "unavailable", reason: "no-query" };
      if (!opts.secret) return { kind: "unavailable", reason: "no-credentials" };
      const signal = AbortSignal.timeout(opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
      const get = async (path: string, params: Record<string, string | number>): Promise<unknown> => {
        const res = await doFetch(`${opts.baseUrl}${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, {
          headers: { "X-App-Secret": opts.secret! },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
        return res.json();
      };
      try {
        const pool = parseNearby(await get("/v1/masjids/nearby", { lat: city.lat, lng: city.lng, radius_km: query.radiusKm, limit: POOL_SIZE }));
        const ids = pickIds(pool, query);
        if (!ids.length) return { kind: "unavailable", reason: "empty" };
        const today = parseToday(await get("/v1/timetables/today", { ids: ids.join(","), date }));
        const byId = new Map(pool.map((m) => [m.id, m]));
        const todayById = new Map(today.map((t) => [t.id, t]));
        const mosques = ids.flatMap((id) => {
          const meta = byId.get(id);
          const row = todayById.get(id);
          const m = meta && row ? toMosque(meta, row, date) : null;
          return m ? [m] : [];
        });
        return mosques.length ? { kind: "live", date, mosques } : { kind: "unavailable", reason: "empty" };
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        return { kind: "unavailable", reason: timedOut ? "timeout" : "error" };
      }
    },
  };
}

// ---------- pure parts, unit-tested without a network ----------

// Wire shapes are private. Parsers drop anything unexpected, so one malformed
// entry loses one mosque, not the section.
interface NearbyWire { id: string; name: string; address: string | null; zipcode: string | null; active: boolean; reliable: boolean }
interface TodayWire { id: string; inactive: boolean; reliable: boolean; day: { date: string; athan: Record<string, unknown>; iqamah: Record<string, unknown>; jummah: unknown[] } | null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
// The API sends booleans or 0/1; only an explicit false/0 excludes.
const flag = (v: unknown) => v !== false && v !== 0;

function masjidList(body: unknown): unknown[] {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.masjids)) throw new Error("unexpected response shape");
  return body.data.masjids;
}

export function parseNearby(body: unknown): readonly NearbyWire[] {
  return masjidList(body).flatMap((m): NearbyWire[] => {
    if (!isRecord(m)) return [];
    const id = str(m.id), name = str(m.name);
    return id && name ? [{ id, name, address: str(m.address), zipcode: str(m.zipcode), active: flag(m.active), reliable: flag(m.times_reliable) }] : [];
  });
}

export function parseToday(body: unknown): readonly TodayWire[] {
  return masjidList(body).flatMap((m): TodayWire[] => {
    if (!isRecord(m)) return [];
    const id = str(m.id);
    if (!id) return [];
    const d = m.day;
    const day = isRecord(d) && str(d.date)
      ? { date: d.date as string, athan: isRecord(d.athan) ? d.athan : {}, iqamah: isRecord(d.iqamah) ? d.iqamah : {}, jummah: Array.isArray(d.jummah) ? d.jummah : [] }
      : null;
    return [{ id, inactive: m.inactive === true || m.inactive === 1, reliable: flag(m.times_reliable), day }];
  });
}

// Featured first (in the given order), then the nearest others, capped at
// max, only active and reliable. Pure.
export function pickIds(pool: readonly NearbyWire[], query: MosqueQuery): readonly MasjidId[] {
  const usable = pool.filter((m) => m.active && m.reliable && MASJID_ID_RE.test(m.id));
  const byId = new Map(usable.map((m) => [m.id, m]));
  const picked = query.featured.flatMap((id) => byId.get(id) ?? []);
  for (const m of usable) if (picked.length < query.max && !picked.includes(m)) picked.push(m);
  return picked.slice(0, query.max).map((m) => m.id as MasjidId);
}

const WALL_CLOCK = /^\d{1,2}:\d{2}/;
const SALAH: readonly PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

function wallClocks(raw: Record<string, unknown>): Partial<Record<PrayerKey, WallClock>> {
  const out: Partial<Record<PrayerKey, WallClock>> = {};
  for (const key of SALAH) {
    const v = raw[key];
    if (typeof v === "string" && WALL_CLOCK.test(v)) out[key] = v as WallClock;
  }
  return out;
}

// Join today's row onto the picked mosque; title-case the name; join address
// and postcode. Null when the day is missing or the mosque is inactive or
// unreliable.
export function toMosque(meta: NearbyWire, today: TodayWire, date: LocalDate): Mosque | null {
  if (!meta.active || !meta.reliable || today.inactive || !today.reliable) return null;
  if (!today.day || today.day.date !== date) return null;
  const street = meta.address ?? "";
  const address = meta.zipcode && !street.includes(meta.zipcode) ? `${street}, ${meta.zipcode}` : street;
  return {
    name: titleCase(meta.name),
    address: address || null,
    postcode: meta.zipcode,
    athan: wallClocks(today.day.athan),
    iqamah: wallClocks(today.day.iqamah),
    jummah: today.day.jummah.filter((j): j is WallClock => typeof j === "string" && WALL_CLOCK.test(j)),
  };
}

// Only all-caps names are changed.
export function titleCase(name: string): string {
  return name === name.toUpperCase() && name !== name.toLowerCase()
    ? name.toLowerCase().replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1))
    : name;
}
