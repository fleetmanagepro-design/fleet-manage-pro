import { describe, expect, it } from "vitest";
import { changeStatusSchema, loadFormSchema } from "@/modules/dispatch/schemas";

const C = "a0000000-0000-4000-8000-000000000001";
const stop = (o: Record<string, string> = {}) => ({ stopType: "pickup", city: "Omaha", state: "NE", timezone: "America/Chicago", ...o });

describe("loadFormSchema", () => {
  const load = (o: Record<string, unknown> = {}) =>
    loadFormSchema.safeParse({
      customerId: C, linehaul: "1,850.00", loadedMiles: "612.5", deadheadMiles: "",
      stops: [stop({ appointmentStart: "2026-12-01T07:00" }), stop({ stopType: "delivery", city: "Denver", state: "CO", timezone: "America/Denver", appointmentStart: "2026-12-02T09:30" })],
      ...o,
    });

  it("parses money in cents, miles exactly and stop times to UTC", () => {
    const r = load();
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ linehaul: 185000, loadedMiles: 612.5 });
    expect(r.data?.stops[0].appointmentStartUtc).toBe("2026-12-01T13:00:00.000Z");
    expect(r.data?.stops[1].appointmentStartUtc).toBe("2026-12-02T16:30:00.000Z");
  });

  it("requires a pickup first and a delivery", () => {
    expect(load({ stops: [stop(), stop()] }).error?.issues.map((i) => i.message)).toContain("Add at least one pickup and one delivery");
    expect(load({ stops: [stop({ stopType: "delivery" }), stop()] }).error?.issues.map((i) => i.message)).toContain("The first stop must be a pickup");
  });

  it("checks appointment windows and drivers", () => {
    const bad = load({ stops: [stop({ appointmentStart: "2026-12-01T10:00", appointmentEnd: "2026-12-01T09:00" }), stop({ stopType: "delivery" })] });
    expect(bad.error?.issues[0]?.path).toEqual(["stops", 0, "appointmentEnd"]);
    expect(load({ driver1Id: C, driver2Id: C }).error?.issues[0]?.path).toEqual(["driver2Id"]);
    expect(load({ driver2Id: C }).error?.issues[0]?.path).toEqual(["driver1Id"]);
  });

  it("rejects bad money and miles", () => {
    expect(load({ linehaul: "" }).success).toBe(false);
    expect(load({ linehaul: "-5" }).success).toBe(false);
    expect(load({ loadedMiles: "12.34" }).success).toBe(false);
  });
});

describe("changeStatusSchema", () => {
  it("needs delivery time and loaded miles for delivered", () => {
    const r = changeStatusSchema.safeParse({ id: C, to: "delivered" });
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(["deliveredAt", "loadedMiles"]);
    expect(changeStatusSchema.safeParse({ id: C, to: "delivered", deliveredAt: "2026-12-02T10:00", loadedMiles: "615" }).success).toBe(true);
  });
});
