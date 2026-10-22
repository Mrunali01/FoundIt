import type { Store, Profile } from "../types";
export function visibleSnapshot(
  s: Store,
  user: Profile | null,
  focus: string | null,
) {
  const claims = s.claims.filter(
    (c) =>
      c.claimant_id === user?.id ||
      s.reports.some(
        (r) => r.id === c.item_report_id && r.reporter_id === user?.id,
      ) ||
      user?.role === "moderator",
  );
  const base = new Set(
    s.reports
      .filter(
        (r) =>
          r.reporter_id === user?.id ||
          r.id === focus ||
          claims.some((c) => c.item_report_id === r.id),
      )
      .map((r) => r.id),
  );
  const ids = new Set([
    ...base,
    ...s.reports
      .filter((r) => r.status === "active")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6)
      .map((r) => r.id),
  ]);
  for (const m of s.matches)
    if (base.has(m.lost_report_id) || base.has(m.found_report_id)) {
      ids.add(m.lost_report_id);
      ids.add(m.found_report_id);
    }
  const reports = s.reports.filter(
    (r) =>
      (ids.has(r.id) || user?.role === "moderator") &&
      (r.status === "active" ||
        r.reporter_id === user?.id ||
        claims.some((c) => c.item_report_id === r.id) ||
        user?.role === "moderator"),
  );
  return {
    reports,
    claims,
    profiles: [],
    matches: s.matches.filter(
      (m) =>
        reports.some((r) => r.id === m.lost_report_id) &&
        reports.some((r) => r.id === m.found_report_id),
    ),
    notifications: s.notifications.filter((n) => n.user_id === user?.id),
    flags: user?.role === "moderator" ? s.flags : [],
  };
}
