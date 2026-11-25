import { describe, expect, it } from "vitest";
import { matchesTerm } from "@/lib/text-search";
import { type SearchHit, groupHits, matchesAll, searchTerm, searchWords } from "@/modules/search/search";

describe("searchTerm", () => {
  it("drops characters that would break or widen the database filter", () => {
    expect(searchTerm("PU-48213")).toBe("PU-48213");
    expect(searchTerm(" 1010 ")).toBe("1010");
    expect(searchTerm("a,b)or(id.eq.1")).toBe("a b or id.eq.1");
    expect(searchTerm("100%*")).toBe("100");
    expect(searchTerm("John   Carter")).toBe("John Carter");
  });
  it("needs at least two characters", () => {
    expect(searchTerm("1")).toBeNull();
    expect(searchTerm(" , ")).toBeNull();
    expect(searchTerm("x".repeat(100))).toHaveLength(60);
  });
});

describe("matchesAll", () => {
  it("every word must appear", () => {
    const w = searchWords("john car");
    expect(matchesAll("John Carter", w)).toBe(true);
    expect(matchesAll("John Smith", w)).toBe(false);
  });
});

describe("groupHits", () => {
  const hit = (kind: SearchHit["kind"], id: string): SearchHit => ({ kind, id, href: `/${id}`, title: id, subtitle: "" });
  it("orders groups loads → drivers → trucks → trailers → customers and caps each group", () => {
    const groups = groupHits([hit("customer", "c1"), hit("load", "l1"), hit("truck", "t1"), hit("load", "l2"), hit("load", "l3")], 2);
    expect(groups.map((g) => g.kind)).toEqual(["load", "truck", "customer"]);
    expect(groups[0].hits.map((h) => h.id)).toEqual(["l1", "l2"]);
  });
});

describe("matchesTerm (list pages)", () => {
  it("matches every word across a row's fields; no term matches everything", () => {
    expect(matchesTerm(["201", "1FUJHHDR0JD610173", "Freightliner", null], "freight 201")).toBe(true);
    expect(matchesTerm(["201", "Freightliner"], "kenworth")).toBe(false);
    expect(matchesTerm(["anything"], null)).toBe(true);
  });
  it("reads the first value of a repeated query parameter", () => {
    expect(searchTerm(["ab", "cd"])).toBe("ab");
    expect(searchTerm(undefined)).toBeNull();
  });
});
