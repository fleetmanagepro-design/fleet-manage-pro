import { describe, expect, it } from "vitest";
import { isDark, parseTheme } from "@/lib/theme";

describe("theme", () => {
  it("reads a stored choice, defaulting to the device setting", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
  });

  it("is dark when chosen, or when following a device that prefers dark", () => {
    expect(isDark("dark", false)).toBe(true);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
  });
});
