import { env, createExecutionContext } from "cloudflare:test";
import { handleFetch, type Deps } from "../src/index";
import { staticRegistry } from "../src/registry";
import type { MosqueSection } from "../src/types";
import type { MosqueSource } from "../src/mosques";

export { FOUR_MOSQUES } from "./mosque-fixtures";

export const LONDON_NOON_OCT_22 = Date.UTC(2026, 9, 22, 11, 0);

export const DOWN: MosqueSection = { kind: "unavailable", reason: "error" };

export function deps(section: MosqueSection, now: number = LONDON_NOON_OCT_22): Deps {
  const source: MosqueSource = { forCity: async () => section };
  return { registry: staticRegistry(), mosqueSource: () => source, now: () => now };
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...env, ...overrides };
}

export const get = (path: string, init?: RequestInit) => new Request(`https://thepillarsapp.com${path}`, init);

export async function fetchWith(path: string, d: Deps, overrides: Partial<Env> = {}): Promise<Response> {
  return handleFetch(get(path), testEnv(overrides), createExecutionContext(), d);
}
