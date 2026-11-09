import { describe, expect, it } from "vitest";
import { createTrailerSchema, createTruckSchema, recordReadingSchema } from "@/modules/fleet/schemas";

const truck = (o: Record<string, string> = {}) =>
  createTruckSchema.safeParse({
    unitNumber: "101", vin: "1xkyd49x5kp048347", year: "", make: "", model: "", plate: "", plateState: "",
    ownership: "owned", purchaseDate: "", purchasePriceCents: "", status: "active", currentOdometer: "",
    registrationExpiresOn: "", annualInspectionOn: "", inspectionValidMonths: "12", insuranceExpiresOn: "", notes: "", ...o,
  });

describe("createTruckSchema", () => {
  it("accepts a minimal truck, normalizing the VIN", () => {
    const r = truck();
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ unitNumber: "101", vin: "1XKYD49X5KP048347", ownership: "owned", status: "active" });
    expect(r.data?.year).toBeUndefined();
    expect(r.data?.currentOdometer).toBeUndefined();
    expect(r.data?.inspectionValidMonths).toBe(12);
  });

  it("parses money as cents and miles exactly", () => {
    const r = truck({ purchasePriceCents: "$128,500.50", currentOdometer: "412,345.6", plate: "p731001", plateState: "il" });
    expect(r.data).toMatchObject({ purchasePriceCents: 12850050, currentOdometer: 412345.6, plate: "P731001", plateState: "IL" });
  });

  it.each([
    [{ vin: "1XKYD49X5KP04834" }, "vin"],
    [{ vin: "" }, "vin"],
    [{ unitNumber: " " }, "unitNumber"],
    [{ year: "1949" }, "year"],
    [{ year: String(new Date().getFullYear() + 2) }, "year"],
    [{ purchasePriceCents: "-5" }, "purchasePriceCents"],
    [{ purchasePriceCents: "12.345" }, "purchasePriceCents"],
    [{ currentOdometer: "12.34" }, "currentOdometer"],
    [{ status: "sold" }, "status"],
    [{ registrationExpiresOn: "2026-02-30" }, "registrationExpiresOn"],
    [{ inspectionValidMonths: "5" }, "inspectionValidMonths"],
    [{ inspectionValidMonths: "" }, "inspectionValidMonths"],
  ])("rejects %j", (o, field) => {
    const r = truck(o);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("createTrailerSchema", () => {
  const trailer = (o: Record<string, string> = {}) =>
    createTrailerSchema.safeParse({
      unitNumber: "5301", vin: "", trailerType: "dry_van", ownership: "owned", status: "active", inspectionValidMonths: "6", ...o,
    });

  it("allows a trailer without VIN", () => {
    expect(trailer().success).toBe(true);
  });

  it("allows reefer hours only on reefers", () => {
    expect(trailer({ trailerType: "reefer", reeferHours: "4200" }).success).toBe(true);
    const r = trailer({ trailerType: "dry_van", reeferHours: "4200" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["reeferHours"]);
  });
});

describe("recordReadingSchema", () => {
  const base = { id: "a0000000-0000-4000-8000-000000000001", readingType: "odometer", reading: "350,000", readOn: "2026-11-09" };

  it("accepts a reading", () => {
    expect(recordReadingSchema.parse(base)).toMatchObject({ reading: 350000, isCorrection: false });
  });

  it("requires a reason for a correction", () => {
    expect(recordReadingSchema.safeParse({ ...base, isCorrection: "on" }).success).toBe(false);
    expect(recordReadingSchema.safeParse({ ...base, isCorrection: "on", note: "Typo" }).success).toBe(true);
  });
});
