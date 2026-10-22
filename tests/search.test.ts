import { it, expect } from "vitest";
import { searchReports } from "../lib/search";
import { seed } from "../lib/seed";
it("normalizes search and combines filters before pagination", () => {
  const p = new URLSearchParams({
    q: "  BLACK wallet ",
    type: "found",
    category: "Bags and wallets",
    location: "Central Library",
    status: "active",
    limit: "1",
  });
  const result = searchReports(seed().reports, p);
  expect(result.total).toBe(1);
  expect(result.reports[0].title).toContain("wallet");
});
it("returns empty and reliable paginated results", () => {
  expect(
    searchReports(seed().reports, new URLSearchParams({ q: "zxqneverexists" }))
      .total,
  ).toBe(0);
  const first = searchReports(
    seed().reports,
    new URLSearchParams({ limit: "5" }),
  );
  const second = searchReports(
    seed().reports,
    new URLSearchParams({ limit: "5", offset: "5" }),
  );
  expect(first.total).toBe(20);
  expect(second.reports).toHaveLength(5);
  expect(
    first.reports.some((r) => second.reports.some((s) => s.id === r.id)),
  ).toBe(false);
});
