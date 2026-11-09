import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

const ORIGIN = "https://app.fleetmanagepro.com";

describe("safeNextPath", () => {
  it.each([
    ["/invite/abc", "/invite/abc"],
    ["/settings/members?tab=1#x", "/settings/members?tab=1#x"],
    ["https://app.fleetmanagepro.com/invite/abc", "/invite/abc"],
  ])("keeps same-origin %s", (input, expected) => {
    expect(safeNextPath(input, ORIGIN)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "//evil.com/x",
    "/\\evil.com",
    "https://evil.com/invite/abc",
    "https://app.fleetmanagepro.com.evil.com/",
    "javascript:alert(1)",
    "evil.com",
    "invite/abc",
    "/foo\nbar",
  ])("rejects %j", (input) => {
    expect(safeNextPath(input, ORIGIN)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", ORIGIN, "/onboarding")).toBe("/onboarding");
  });
});
