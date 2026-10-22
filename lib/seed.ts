import type { Store, Report, ClaimStatus } from "./types";
export const campus = "11111111-1111-4111-8111-111111111111";
export const students = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    display_name: "Aarav (demo)",
    role: "student" as const,
    campus_id: campus,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    display_name: "Meera (demo)",
    role: "student" as const,
    campus_id: campus,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    display_name: "Campus moderator (demo)",
    role: "moderator" as const,
    campus_id: campus,
  },
];
const items = [
  [
    "Black leather wallet",
    "Bags and wallets",
    "black",
    "Central Library",
    "wallet leather card pockets",
  ],
  [
    "White wireless earbuds",
    "Electronics",
    "white",
    "Cafeteria",
    "wireless earbuds white charging case",
  ],
  [
    "Blue steel bottle",
    "Water bottles and containers",
    "blue",
    "Sports Complex",
    "blue insulated steel water bottle",
  ],
  [
    "Silver key ring",
    "Keys",
    "silver",
    "Main Gate",
    "three keys round silver ring",
  ],
  [
    "Student ID card",
    "ID cards and documents",
    "blue",
    "Academic Block",
    "campus identity card blue lanyard",
  ],
  [
    "Red umbrella",
    "Other",
    "red",
    "Academic Block",
    "red folding umbrella wooden handle",
  ],
  [
    "Physics notebook",
    "Books and stationery",
    "green",
    "Central Library",
    "green notebook physics handwritten notes",
  ],
  [
    "Grey backpack",
    "Bags and wallets",
    "grey",
    "Student Centre",
    "grey backpack two front pockets",
  ],
  [
    "Black smartwatch",
    "Electronics",
    "black",
    "Sports Complex",
    "black watch silicone strap",
  ],
  [
    "Denim jacket",
    "Clothing and accessories",
    "blue",
    "Cafeteria",
    "blue denim jacket brass buttons",
  ],
];
export function seed(): Store {
  const reports: Report[] = items.flatMap((a, i) =>
    (["lost", "found"] as const).map((type, j) => ({
      id: `55555555-5555-4555-8555-${String(i * 2 + j + 1).padStart(12, "0")}`,
      reporter_id: students[j].id,
      campus_id: campus,
      type,
      title: j ? `${a[0]} found` : a[0],
      description: j
        ? `Picked up ${a[4]}. Please describe an identifying detail privately.`
        : `Missing my ${a[4]}. Last seen after class.`,
      category: a[1],
      color: a[2],
      brand: "",
      location_label: a[3],
      event_date: `2026-10-${String(20 - i).padStart(2, "0")}`,
      status: i === 9 ? "resolved" : "active",
      created_at: `2026-10-${String(20 - i).padStart(2, "0")}T10:00:00Z`,
    })),
  );
  const store: Store = {
    profiles: structuredClone(students),
    reports,
    claims: (
      ["pending", "approved", "rejected", "completed"] as ClaimStatus[]
    ).map((status, i) => ({
      id: `66666666-6666-4666-8666-${String(i + 1).padStart(12, "0")}`,
      item_report_id: reports[[5, 7, 11, 19][i]].id,
      claimant_id: students[0].id,
      message: [
        "There is a small sticker under the bottle base.",
        "One key has a green rubber cap.",
        "The handle has a small chip near the strap.",
        "There is a stitched star inside the collar.",
      ][i],
      status,
      review_note:
        status === "approved"
          ? "Meet at campus security during office hours."
          : "",
      created_at: "2026-10-20T12:00:00Z",
      history: [
        { status: "pending" as const, at: "2026-10-20T12:00:00Z" },
        ...(status === "pending"
          ? []
          : [{ status, at: "2026-10-20T14:00:00Z" }]),
      ],
    })),
    notifications: [],
    matches: [],
    flags: [],
  };
  for (const claim of store.claims) {
    const report = store.reports.find((r) => r.id === claim.item_report_id)!;
    store.notifications.push({
      id: `seed-claim:${claim.id}`,
      user_id:
        claim.status === "pending" ? report.reporter_id : claim.claimant_id,
      title:
        claim.status === "pending"
          ? "New ownership claim"
          : `Claim ${claim.status}`,
      body:
        claim.status === "pending"
          ? "A student submitted private ownership evidence."
          : `Your ownership claim was ${claim.status}. Open it to review the details.`,
      report_id: report.id,
      read: false,
      created_at: claim.created_at,
    });
  }
  return store;
}
