/** Light / dark / follow the device. Stored per device in localStorage (a convenience, not account data). */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_KEY = "fmp-theme";

export function parseTheme(v: string | null | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

/** Whether the page should be dark for `theme`, given whether the device prefers dark. */
export function isDark(theme: Theme, devicePrefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && devicePrefersDark);
}

/**
 * Runs before the page paints (inline in <head>) so a dark page never flashes white.
 * Kept tiny and dependency-free on purpose.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
