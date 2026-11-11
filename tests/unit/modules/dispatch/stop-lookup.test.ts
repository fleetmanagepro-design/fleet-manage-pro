import { describe, expect, it } from "vitest";
import { emptyStop } from "@/modules/dispatch/load-draft";
import { type Facility, SPLIT_TIME_ZONE_STATES, applyFacility, applyZip, matchFacilities, zip5 } from "@/modules/dispatch/stop-lookup";

const f = (o: Partial<Facility>): Facility => ({
  id: "f", name: "Walmart DC 6092", address_line1: "2101 Stafford Rd", city: "Plainfield", state: "IN", zip: "46168",
  timezone: "America/Indiana/Indianapolis", use_count: 1, ...o,
});

describe("zip5", () => {
  it("accepts 5-digit and ZIP+4, nothing else", () => {
    expect(zip5("60439")).toBe("60439");
    expect(zip5(" 60439-1234 ")).toBe("60439");
    expect(zip5("6043")).toBeNull();
    expect(zip5("604391")).toBeNull();
    expect(zip5("ABCDE")).toBeNull();
  });
});

describe("applyZip", () => {
  it("fills city, state and time zone from the ZIP", () => {
    const s = applyZip({ ...emptyStop("pickup", "America/New_York"), zip: "42001" },
      { zip: "42001", city: "Paducah", state: "KY", timezone: "America/Chicago" });
    expect(s).toMatchObject({ zip: "42001", city: "Paducah", state: "KY", timezone: "America/Chicago" });
  });
  it("keeps the stop's time zone if the ZIP's zone isn't one a stop can use", () => {
    const s = applyZip(emptyStop("pickup", "America/Chicago"), { zip: "1", city: "X", state: "AK", timezone: "America/Adak" });
    expect(s.timezone).toBe("America/Chicago");
  });
});

describe("applyFacility", () => {
  it("fills the whole address and keeps type and appointment", () => {
    const stop = { ...emptyStop("delivery", "America/Chicago"), appointmentStart: "2026-11-12T08:00" };
    expect(applyFacility(stop, f({ address_line1: null, zip: null }))).toMatchObject({
      stopType: "delivery", appointmentStart: "2026-11-12T08:00", facilityName: "Walmart DC 6092", addressLine1: "", zip: "",
      city: "Plainfield", state: "IN", timezone: "America/Indiana/Indianapolis",
    });
  });
});

describe("matchFacilities", () => {
  const all = [
    f({ id: "1", name: "Walmart DC 6092", use_count: 3 }),
    f({ id: "2", name: "Walmart DC 7045", city: "Joliet", state: "IL", zip: "60436", use_count: 9 }),
    f({ id: "3", name: "Kroger Warehouse", city: "Columbus", state: "OH", zip: "43215", use_count: 20 }),
  ];
  it("matches word starts in name, city and ZIP; most used first", () => {
    expect(matchFacilities(all, "wal").map((x) => x.id)).toEqual(["2", "1"]);
    expect(matchFacilities(all, "wal dc 604").map((x) => x.id)).toEqual(["2"]);
    expect(matchFacilities(all, "columbus").map((x) => x.id)).toEqual(["3"]);
    expect(matchFacilities(all, "Walmart joliet").map((x) => x.id)).toEqual(["2"]);
  });
  it("needs at least two characters and ignores punctuation", () => {
    expect(matchFacilities(all, "w")).toEqual([]);
    expect(matchFacilities(all, "  ")).toEqual([]);
    expect(matchFacilities(all, "walmart, dc").length).toBe(2);
    expect(matchFacilities(all, "target")).toEqual([]);
  });
  it("limits the list", () => {
    expect(matchFacilities(all, "wa", 1)).toHaveLength(1);
  });
});

describe("split time-zone states", () => {
  it("flags states with two zones", () => {
    expect(SPLIT_TIME_ZONE_STATES.has("KY")).toBe(true);
    expect(SPLIT_TIME_ZONE_STATES.has("IL")).toBe(false);
  });
});
