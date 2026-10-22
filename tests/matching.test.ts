import { describe, it, expect } from "vitest";
import { normalize, similarity, scorePair } from "../lib/matching";
import { seed } from "../lib/seed";
describe("explainable matching", () => {
  const [lost, found] = seed().reports;
  it("normalizes punctuation, whitespace and case", () =>
    expect(normalize("  Blue,   BOTTLE! ")).toBe("blue bottle"));
  it("uses unique tokens and handles empty strings", () => {
    expect(similarity("blue blue bottle", "blue bottle")).toBe(1);
    expect(similarity("", "")).toBe(0);
  });
  it("recognizes imperfect titles", () =>
    expect(similarity("black leather wallet", "black wallet found")).toBe(0.5));
  it("scores a strong pair with supported reasons", () => {
    const result = scorePair(lost, found)!;
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.reasons).toContain("Both described as black");
    expect(result.reasons).toContain("Same campus location");
  });
  it("rejects impossible campus, type, category, status and self pairs", () => {
    for (const candidate of [
      { ...found, campus_id: "other" },
      { ...found, type: "lost" as const },
      { ...found, status: "closed" as const },
      { ...found, category: "Electronics" },
      lost,
    ])
      expect(scorePair(lost, candidate)).toBeNull();
  });
  it("treats optional attributes as unknown", () => {
    const r = scorePair(
      { ...lost, color: "", brand: "" },
      { ...found, color: "", brand: "" },
    )!;
    expect(r.score).toBeGreaterThan(60);
    expect(r.reasons.some((x) => x.startsWith("Both described"))).toBe(false);
  });
  it("caps weak title matches below notification threshold", () =>
    expect(
      scorePair(lost, {
        ...found,
        title: "Green suitcase",
        description: "Unrelated description",
        color: "green",
      })!.score,
    ).toBeLessThan(65));
  it("does not explain mismatched fields as matches", () =>
    expect(
      scorePair(lost, { ...found, color: "red", location_label: "Main Gate" })!
        .reasons,
    ).not.toContain("Same campus location"));
});
