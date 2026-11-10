import { describe, expect, it } from "vitest";
import { nestedFormValues } from "@/lib/nested-form";

describe("nestedFormValues", () => {
  it("groups indexed fields into arrays in index order, skipping gaps", () => {
    const fd = new FormData();
    fd.set("customerId", "c1");
    fd.set("stops.2.city", "Denver");
    fd.set("stops.0.city", "Omaha");
    fd.set("stops.0.state", "NE");
    fd.set("$ACTION_ID_x", "ignored");
    expect(nestedFormValues(fd)).toEqual({
      customerId: "c1",
      stops: [{ city: "Omaha", state: "NE" }, { city: "Denver" }],
    });
  });
});
