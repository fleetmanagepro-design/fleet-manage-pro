"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchEverything } from "../actions";
import { SEARCH_LABELS, type SearchHit, groupHits, searchTerm } from "../search";

/** Search box at the top of the menu: loads, drivers, trucks, trailers, customers. Press "/" to focus it. */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Closing waits a moment after blur (so a click on a result lands); focusing or typing again cancels it.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };

  // "/" focuses the search from anywhere except while typing in a field.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (ev.key === "/" && !(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))) {
        ev.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search 250 ms after typing stops; ignore answers to older queries.
  useEffect(() => {
    const term = searchTerm(query);
    if (!term) return;
    const timer = setTimeout(() => {
      void searchEverything(term).then((result) => {
        if (searchTerm(inputRef.current?.value ?? "") !== term) return;
        setHits(result);
        setSearched(term);
        setActive(0);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const hasTerm = searchTerm(query) !== null;
  const groups = hasTerm ? groupHits(hits) : [];
  const flat = groups.flatMap((g) => g.hits);
  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setSearched(null);
    router.push(hit.href);
  };

  return (
    <div className="relative">
      <Input ref={inputRef} type="search" placeholder="Search…  ( / )" aria-label="Search" value={query} autoComplete="off"
        role="combobox" aria-expanded={open && hasTerm} aria-controls="global-search-results"
        onChange={(ev) => { setQuery(ev.target.value); show(); }}
        onFocus={show}
        onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          if (!flat.length) return;
          if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
          else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (ev.key === "Enter") { ev.preventDefault(); go(flat[active]); }
        }} />
      {open && hasTerm && (
        <div id="global-search-results" role="listbox" aria-label="Search results"
          className="absolute z-30 mt-1 max-h-[70vh] w-full min-w-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-lg">
          {groups.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground">{searched === searchTerm(query) ? "Nothing found." : "Searching…"}</p>
          ) : groups.map((g) => (
            <div key={g.kind} className="py-1" data-testid={`search-group-${g.kind}`}>
              <div className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{SEARCH_LABELS[g.kind]}</div>
              {g.hits.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <div key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}
                    className={`cursor-pointer rounded px-2 py-1.5 ${i === active ? "bg-accent" : ""}`}
                    onMouseDown={(ev) => { ev.preventDefault(); go(h); }} onMouseEnter={() => setActive(i)}>
                    <div className="font-medium">{h.title}</div>
                    {h.subtitle && <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
