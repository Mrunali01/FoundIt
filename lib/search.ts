import type { Report } from "./types";
import { normalize } from "./matching";
export function searchReports(reports: Report[], p: URLSearchParams) {
  const words = normalize(p.get("q") || "")
    .split(" ")
    .filter(Boolean);
  const score = (r: Report) =>
    words.filter((w) => normalize(r.title + " " + r.description).includes(w))
      .length;
  const filtered = reports
    .filter(
      (r) =>
        (!p.get("type") ||
          p.get("type") === "all" ||
          r.type === p.get("type")) &&
        (!p.get("category") || r.category === p.get("category")) &&
        (!p.get("location") || r.location_label === p.get("location")) &&
        (!p.get("status") || r.status === p.get("status")) &&
        (!p.get("from") || r.event_date >= p.get("from")!) &&
        (!p.get("to") || r.event_date <= p.get("to")!) &&
        (!words.length || score(r) > 0),
    )
    .sort((a, b) =>
      p.get("sort") === "relevance"
        ? score(b) - score(a) || b.created_at.localeCompare(a.created_at)
        : b.created_at.localeCompare(a.created_at),
    );
  const offset = Math.max(0, Number(p.get("offset")) || 0),
    limit = Math.min(60, Math.max(1, Number(p.get("limit")) || 9));
  return {
    reports: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
