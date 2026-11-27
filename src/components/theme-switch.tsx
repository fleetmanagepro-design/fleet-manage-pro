"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { THEME_KEY, isDark, parseTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", isDark(theme, prefersDark));
}

/** Light / Dark / System, remembered on this device. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // localStorage only exists in the browser, so the stored choice is read after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(read());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // private window / storage blocked: the choice lasts until reload
    }
    apply(t);
  };

  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-md border border-sidebar-border bg-sidebar-accent/50 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={theme === value} title={label} onClick={() => choose(value)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
            theme === value ? "bg-sidebar-accent text-white" : "text-sidebar-muted hover:text-white",
          )}>
          <Icon aria-hidden className={cn("size-3.5", theme === value && "text-gold")} />
          {label}
        </button>
      ))}
    </div>
  );
}
