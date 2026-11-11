import { STOP_TIME_ZONES } from "@/lib/us";
import type { StopDraft } from "./load-draft";

/**
 * Filling in stops (decision of 11/11/2026): from a ZIP code (city, state, time zone) and from
 * remembered facilities (the organization's shippers and receivers). Pure functions.
 */

export type ZipInfo = { zip: string; city: string; state: string; timezone: string };

export type Facility = {
  id: string;
  name: string;
  address_line1: string | null;
  city: string;
  state: string;
  zip: string | null;
  timezone: string;
  use_count: number;
};

/** "60439" or "60439-1234" → "60439"; anything else → null. */
export function zip5(value: string): string | null {
  const m = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(value);
  return m ? m[1] : null;
}

const KNOWN_ZONES = new Set<string>(STOP_TIME_ZONES.map((z) => z.value));

/** A stop after its ZIP was looked up: city, state and time zone come from the ZIP. */
export function applyZip(stop: StopDraft, info: ZipInfo): StopDraft {
  return {
    ...stop,
    city: info.city,
    state: info.state,
    timezone: KNOWN_ZONES.has(info.timezone) ? info.timezone : stop.timezone,
  };
}

/** A stop filled from a remembered facility. Appointment times and stop type stay as they are. */
export function applyFacility(stop: StopDraft, f: Facility): StopDraft {
  return {
    ...stop,
    facilityName: f.name,
    addressLine1: f.address_line1 ?? "",
    city: f.city,
    state: f.state,
    zip: f.zip ?? "",
    timezone: KNOWN_ZONES.has(f.timezone) ? f.timezone : stop.timezone,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Facilities matching what was typed in the facility field: every word must start a word of the
 * facility's name, city or ZIP ("wal dc" → "Walmart DC 6092"). Most used first.
 */
export function matchFacilities(all: readonly Facility[], query: string, limit = 6): Facility[] {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0 || norm(query).length < 2) return [];
  return all
    .filter((f) => {
      const hay = norm(`${f.name} ${f.city} ${f.state} ${f.zip ?? ""}`).split(" ");
      return words.every((w) => hay.some((h) => h.startsWith(w)));
    })
    .sort((a, b) => b.use_count - a.use_count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** States with more than one time zone: the zone from the ZIP or state is a suggestion to check. */
export const SPLIT_TIME_ZONE_STATES = new Set(["AK", "AZ", "FL", "ID", "IN", "KS", "KY", "MI", "ND", "NE", "OR", "SD", "TN", "TX"]);
