/**
 * Overlapping assignments (PRODUCT_SPEC §4.4): a truck or driver can't be on two loads
 * whose time windows overlap. A load's window runs from its earliest appointment start
 * to its latest appointment end (or start). Loads without appointment times have no window.
 */
export type StopTimes = { appointment_start: string | null; appointment_end: string | null };
export type Window = { start: number; end: number };

export function loadWindow(stops: readonly StopTimes[]): Window | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of stops) {
    for (const t of [s.appointment_start, s.appointment_end]) {
      if (!t) continue;
      const ms = Date.parse(t);
      if (ms < start) start = ms;
      if (ms > end) end = ms;
    }
  }
  return Number.isFinite(start) ? { start, end } : null;
}

/** Windows that touch end-to-start don't overlap (delivery at 14:00, next pickup at 14:00 is fine). */
export function windowsOverlap(a: Window, b: Window): boolean {
  return a.start < b.end && b.start < a.end;
}

export type AssignmentCandidate = {
  id: string;
  load_number: string;
  truck_id: string | null;
  driver_ids: string[];
  stops: StopTimes[];
};

export type Conflict = { loadId: string; loadNumber: string; reason: "truck" | "driver" };

export function findConflicts(
  target: { id?: string; truck_id: string | null; driver_ids: string[]; stops: StopTimes[] },
  others: readonly AssignmentCandidate[],
): Conflict[] {
  const window = loadWindow(target.stops);
  if (!window) return [];
  const conflicts: Conflict[] = [];
  for (const o of others) {
    if (o.id === target.id) continue;
    const w = loadWindow(o.stops);
    if (!w || !windowsOverlap(window, w)) continue;
    if (target.truck_id && o.truck_id === target.truck_id) {
      conflicts.push({ loadId: o.id, loadNumber: o.load_number, reason: "truck" });
    } else if (o.driver_ids.some((d) => target.driver_ids.includes(d))) {
      conflicts.push({ loadId: o.id, loadNumber: o.load_number, reason: "driver" });
    }
  }
  return conflicts;
}
