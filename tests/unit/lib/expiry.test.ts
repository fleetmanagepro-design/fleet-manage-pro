import { describe, expect, it } from "vitest";
import { expiryItem, worstState } from "@/lib/expiry";

const T = "2026-11-09";

describe("expiryItem", () => {
  it("uses 30 days by default and an optional upcoming window", () => {
    expect(expiryItem("x", "X", "2026-12-09", T).state).toBe("due_soon");
    expect(expiryItem("x", "X", "2026-12-20", T).state).toBe("ok");
    expect(expiryItem("x", "X", "2026-12-20", T, { upcomingDays: 60 }).state).toBe("upcoming");
    expect(expiryItem("x", "X", "2027-01-08", T, { upcomingDays: 60 }).state).toBe("upcoming"); // 60 days
    expect(expiryItem("x", "X", "2027-01-09", T, { upcomingDays: 60 }).state).toBe("ok"); // 61 days
    expect(expiryItem("x", "X", "2026-11-08", T).state).toBe("expired");
    expect(expiryItem("x", "X", null, T)).toMatchObject({ state: "missing", daysLeft: null });
  });

  it("ranks states", () => {
    const up = expiryItem("a", "A", "2026-12-20", T, { upcomingDays: 60 });
    const ok = expiryItem("b", "B", "2027-12-20", T);
    expect(worstState([ok, up])).toBe("upcoming");
    expect(worstState([ok, expiryItem("c", "C", null, T)])).toBe("ok");
  });
});
