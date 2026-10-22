import { describe, it, expect } from "vitest";
import { seed, students } from "../lib/seed";
import { reviewClaim } from "../lib/services/workflows";
import type { Claim, Store } from "../lib/types";
function fixture() {
  const s = seed();
  s.claims = [];
  s.notifications = [];
  const r = s.reports[1];
  const claim: Claim = {
    id: "test-claim",
    item_report_id: r.id,
    claimant_id: students[0].id,
    message: "Distinctive mark inside wallet",
    status: "pending",
    review_note: "",
    created_at: new Date().toISOString(),
    history: [],
  };
  s.claims.push(claim);
  return s;
}
describe("claim state machine", () => {
  it("rejects self approval", () => {
    const s = fixture();
    expect(() =>
      reviewClaim(s, students[0], "test-claim", "approved", ""),
    ).toThrow("cannot review");
  });
  it("rejects unrelated reviewers", () => {
    const s = fixture();
    expect(() =>
      reviewClaim(
        s,
        { ...students[0], id: "stranger" },
        "test-claim",
        "approved",
        "",
      ),
    ).toThrow();
  });
  it("requires approval before handover", () =>
    expect(() =>
      reviewClaim(fixture(), students[1], "test-claim", "completed", ""),
    ).toThrow("Invalid claim transition"));
  it("completes recovery and rejects competing claims", () => {
    const s = fixture();
    s.claims.push({
      ...s.claims[0],
      id: "competing",
      claimant_id: "other",
      history: [],
    });
    reviewClaim(s, students[1], "test-claim", "approved", "Meet security");
    reviewClaim(s, students[1], "test-claim", "completed", "");
    expect(s.reports[1].status).toBe("resolved");
    expect(s.claims.map((c) => c.status)).toEqual(["completed", "rejected"]);
    expect(s.notifications).toHaveLength(3);
    expect(() =>
      reviewClaim(s, students[1], "test-claim", "completed", ""),
    ).toThrow();
  });
  it("prevents simultaneous approved claimants", () => {
    const s = fixture();
    s.claims.push({
      ...s.claims[0],
      id: "competing",
      claimant_id: "other",
      history: [],
    });
    reviewClaim(s, students[1], "test-claim", "approved", "");
    expect(() =>
      reviewClaim(s, students[1], "competing", "approved", ""),
    ).toThrow("already approved");
  });
  it("allows only eligible claimant withdrawals", () => {
    const s = fixture();
    reviewClaim(s, students[0], "test-claim", "withdrawn", "");
    expect(s.claims[0].status).toBe("withdrawn");
    expect(() =>
      reviewClaim(s, students[0], "test-claim", "withdrawn", ""),
    ).toThrow();
  });
  it("blocks cross-campus moderator access", () => {
    const s: Store = fixture();
    expect(() =>
      reviewClaim(
        s,
        { ...students[2], campus_id: "other" },
        "test-claim",
        "approved",
        "",
      ),
    ).toThrow();
  });
});
