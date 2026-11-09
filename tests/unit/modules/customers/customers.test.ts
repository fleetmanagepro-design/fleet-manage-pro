import { describe, expect, it } from "vitest";
import { contactSchema, customerSchema } from "@/modules/customers/schemas";
import { mcDigits, sanitizeSearch } from "@/modules/customers/search";

describe("sanitizeSearch", () => {
  it("keeps company-name characters and drops PostgREST syntax", () => {
    expect(sanitizeSearch("  Smith & Sons, Inc.  ")).toBe("Smith & Sons Inc.");
    expect(sanitizeSearch("a),name.eq.x(")).toBe("a name.eq.x");
    expect(sanitizeSearch("100%*")).toBe("100");
    expect(sanitizeSearch(["first", "second"])).toBe("first");
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch("x".repeat(150))).toHaveLength(100);
  });
});

describe("mcDigits", () => {
  it("recognizes MC numbers as people write them", () => {
    expect(mcDigits("610233")).toBe("610233");
    expect(mcDigits("MC-610233")).toBe("610233");
    expect(mcDigits("mc 610233")).toBe("610233");
    expect(mcDigits("Northline")).toBeNull();
    expect(mcDigits("123456789")).toBeNull();
  });
});

describe("customerSchema", () => {
  const c = (o: Record<string, string> = {}) =>
    customerSchema.safeParse({ name: "Acme Freight", customerType: "broker", paymentTermsDays: "30", status: "active", ...o });

  it("accepts a minimal customer", () => {
    expect(c().data).toMatchObject({ name: "Acme Freight", paymentTermsDays: 30 });
  });

  it("normalizes MC number and billing email", () => {
    expect(c({ mcNumber: "MC-610233", billingEmail: " AP@Acme.TEST " }).data).toMatchObject({
      mcNumber: "610233",
      billingEmail: "ap@acme.test",
    });
  });

  it("requires a reason for do not use", () => {
    const r = c({ status: "do_not_use" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["doNotUseReason"]);
    expect(c({ status: "do_not_use", doNotUseReason: "Late payer" }).success).toBe(true);
  });

  it.each([
    [{ paymentTermsDays: "181" }, "paymentTermsDays"],
    [{ paymentTermsDays: "-1" }, "paymentTermsDays"],
    [{ paymentTermsDays: "7.5" }, "paymentTermsDays"],
    [{ mcNumber: "12AB" }, "mcNumber"],
    [{ zip: "1234" }, "zip"],
    [{ name: "" }, "name"],
  ])("rejects %j", (o, field) => {
    const r = c(o);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("contactSchema", () => {
  const id = "a0000000-0000-4000-8000-000000000001";
  it("needs an email or a phone", () => {
    expect(contactSchema.safeParse({ customerId: id, name: "Kelly" }).success).toBe(false);
    expect(contactSchema.safeParse({ customerId: id, name: "Kelly", phone: "(312) 555-0141" }).success).toBe(true);
  });
});
