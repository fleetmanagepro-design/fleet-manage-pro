import { describe, expect, it } from "vitest";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/modules/accounts/schemas";

const org = (overrides: Record<string, string> = {}) =>
  createOrganizationSchema.safeParse({
    name: "Lakeside Freight LLC",
    usdotNumber: "",
    mcNumber: "",
    addressLine1: "",
    city: "",
    state: "",
    zip: "",
    timezone: "America/Chicago",
    ...overrides,
  });

describe("createOrganizationSchema", () => {
  it("accepts a minimal organization and turns empty fields into undefined", () => {
    const r = org();
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ name: "Lakeside Freight LLC", timezone: "America/Chicago" });
  });

  it("normalizes USDOT/MC prefixes, state case and whitespace", () => {
    const r = org({ name: "  Acme  ", usdotNumber: "USDOT 3141592", mcNumber: "MC-108842", state: "il", zip: "60436-1234" });
    expect(r.data).toMatchObject({ name: "Acme", usdotNumber: "3141592", mcNumber: "108842", state: "IL", zip: "60436-1234" });
  });

  it.each([
    [{ name: "   " }, "name"],
    [{ usdotNumber: "12AB" }, "usdotNumber"],
    [{ usdotNumber: "123456789" }, "usdotNumber"],
    [{ state: "XX" }, "state"],
    [{ zip: "6043" }, "zip"],
    [{ timezone: "Europe/Belgrade" }, "timezone"],
  ])("rejects %j", (overrides, field) => {
    const r = org(overrides);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path[0]).toBe(field);
  });
});

describe("signUpSchema", () => {
  const base = { firstName: "Dana", lastName: "Price", email: " Dana@Example.COM ", password: "longenough" };

  it("lowercases and trims email", () => {
    expect(signUpSchema.parse(base).email).toBe("dana@example.com");
  });

  it("enforces password length 8–72", () => {
    expect(signUpSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(72) }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords", () => {
    const r = resetPasswordSchema.safeParse({ password: "password-1", confirmPassword: "password-2" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

describe("inviteMemberSchema", () => {
  it("accepts valid roles only", () => {
    expect(inviteMemberSchema.safeParse({ email: "a@b.co", role: "dispatcher" }).success).toBe(true);
    expect(inviteMemberSchema.safeParse({ email: "a@b.co", role: "superuser" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "not-an-email", role: "viewer" }).success).toBe(false);
  });
});
