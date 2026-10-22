import type { ClaimStatus, Profile, Store } from "../types";
export function reviewClaim(
  s: Store,
  user: Profile,
  id: string,
  status: ClaimStatus,
  note: string,
) {
  const claim = s.claims.find((c) => c.id === id);
  if (!claim) throw Error("Claim unavailable");
  const report = s.reports.find((r) => r.id === claim.item_report_id);
  if (!report || report.campus_id !== user.campus_id)
    throw Error("Report unavailable");
  const reviewer =
    (report.reporter_id === user.id || user.role === "moderator") &&
    claim.claimant_id !== user.id;
  if (status === "withdrawn") {
    if (
      claim.claimant_id !== user.id ||
      !["pending", "under_review", "approved"].includes(claim.status)
    )
      throw Error("Cannot withdraw this claim");
  } else {
    if (!reviewer) throw Error("You cannot review this claim");
    if (!["active", "under_review"].includes(report.status))
      throw Error("Report is no longer available");
    const allowed: Partial<Record<ClaimStatus, ClaimStatus[]>> = {
      pending: ["under_review", "approved", "rejected"],
      under_review: ["approved", "rejected"],
      approved: ["completed"],
    };
    if (!allowed[claim.status]?.includes(status))
      throw Error("Invalid claim transition");
    if (
      status === "approved" &&
      s.claims.some(
        (c) =>
          c.item_report_id === report.id &&
          c.id !== id &&
          ["approved", "completed"].includes(c.status),
      )
    )
      throw Error("Another claim is already approved");
    if (status === "completed") {
      report.status = "resolved";
      report.resolved_at = new Date().toISOString();
      for (const other of s.claims.filter(
        (c) =>
          c.item_report_id === report.id &&
          c.id !== id &&
          ["pending", "under_review"].includes(c.status),
      )) {
        other.status = "rejected";
        s.notifications.push({
          id: crypto.randomUUID(),
          user_id: other.claimant_id,
          title: "Claim closed after recovery",
          body: "The item has been returned following another verified claim.",
          report_id: report.id,
          read: false,
          created_at: new Date().toISOString(),
        });
        other.history.push({
          status: "rejected",
          at: new Date().toISOString(),
        });
      }
    }
  }
  claim.status = status;
  claim.review_note = note;
  claim.history.push({ status, at: new Date().toISOString() });
  s.notifications.push({
    id: crypto.randomUUID(),
    user_id: claim.claimant_id,
    title: `Claim ${status}`,
    body:
      status === "approved"
        ? "Arrange a handover at campus security. A similarity score is not proof of ownership."
        : `Your claim status changed to ${status}.`,
    report_id: report.id,
    read: false,
    created_at: new Date().toISOString(),
  });
}
