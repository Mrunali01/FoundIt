import type { Report } from "./types";
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
export function similarity(a: string, b: string) {
  const x = new Set(normalize(a).split(" ").filter(Boolean)),
    y = new Set(normalize(b).split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  return [...x].filter((t) => y.has(t)).length / new Set([...x, ...y]).size;
}
export const DEFAULT_MATCH_WEIGHTS = {
  category: 20,
  title: 25,
  description: 20,
  color: 10,
  brand: 10,
  date: 10,
  location: 5,
};
export function scorePair(
  a: Report,
  b: Report,
  weights = DEFAULT_MATCH_WEIGHTS,
) {
  if (
    a.id === b.id ||
    a.campus_id !== b.campus_id ||
    a.type === b.type ||
    a.status !== "active" ||
    b.status !== "active" ||
    a.category !== b.category
  )
    return null;
  const reasons: string[] = ["Same item category"];
  let total = weights.category,
    weight = weights.category;
  const add = (w: number, s: number, reason: string) => {
    weight += w;
    total += w * s;
    if (s >= 0.5) reasons.push(reason);
  };
  add(weights.title, similarity(a.title, b.title), "Similar item titles");
  add(
    weights.description,
    similarity(a.description, b.description),
    "Shared description details",
  );
  if (a.color && b.color)
    add(
      weights.color,
      normalize(a.color) === normalize(b.color) ? 1 : 0,
      `Both described as ${a.color}`,
    );
  if (a.brand && b.brand)
    add(
      weights.brand,
      normalize(a.brand) === normalize(b.brand) ? 1 : 0,
      `Same brand: ${a.brand}`,
    );
  if (a.event_date && b.event_date)
    add(
      weights.date,
      Math.max(
        0,
        1 -
          Math.abs(Date.parse(a.event_date) - Date.parse(b.event_date)) /
            86400000 /
            14,
      ),
      "Lost and found dates are close",
    );
  if (a.location_label && b.location_label)
    add(
      weights.location,
      a.location_label === b.location_label ? 1 : 0,
      "Same campus location",
    );
  return {
    score: Math.min(
      Math.round((total / weight) * 100),
      similarity(a.title, b.title) < 0.1 ? 55 : 100,
    ),
    reasons,
  };
}
