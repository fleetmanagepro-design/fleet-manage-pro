"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { type Facility, matchFacilities } from "../stop-lookup";

type Props = {
  id: string;
  name: string;
  value: string;
  facilities: readonly Facility[];
  errors?: string[];
  onChange: (value: string) => void;
  onPick: (facility: Facility) => void;
};

/** Facility name with suggestions from the organization's remembered shippers and receivers. */
export function FacilityInput({ id, name, value, facilities, errors, onChange, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = open ? matchFacilities(facilities, value) : [];
  const listId = `${id}-suggestions`;

  const pick = (f: Facility) => {
    onPick(f);
    setOpen(false);
  };

  return (
    <FormField id={id} label="Facility" errors={errors}>
      <div className="relative">
        <Input id={id} name={name} value={value} autoComplete="off" role="combobox" aria-expanded={matches.length > 0}
          aria-controls={listId} aria-autocomplete="list" aria-invalid={errors?.length ? true : undefined}
          onChange={(ev) => { onChange(ev.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(ev) => {
            if (!matches.length) return;
            if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (ev.key === "Enter") { ev.preventDefault(); pick(matches[active]); }
            else if (ev.key === "Escape") setOpen(false);
          }} />
        {matches.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Saved facilities"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {matches.map((f, i) => (
              <li key={f.id} role="option" aria-selected={i === active}
                className={`cursor-pointer rounded px-2 py-1.5 ${i === active ? "bg-accent" : ""}`}
                onMouseDown={(ev) => { ev.preventDefault(); pick(f); }}
                onMouseEnter={() => setActive(i)}>
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[f.address_line1, `${f.city}, ${f.state}`, f.zip].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormField>
  );
}
