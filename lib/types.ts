export const categories = [
  "Electronics",
  "Bags and wallets",
  "Keys",
  "ID cards and documents",
  "Clothing and accessories",
  "Books and stationery",
  "Water bottles and containers",
  "Other",
] as const;
export const locations = [
  "Central Library",
  "Cafeteria",
  "Sports Complex",
  "Academic Block",
  "Student Centre",
  "Main Gate",
];
export type Report = {
  id: string;
  reporter_id: string;
  campus_id: string;
  type: "lost" | "found";
  title: string;
  description: string;
  category: string;
  color: string;
  brand: string;
  location_label: string;
  event_date: string;
  status: "active" | "under_review" | "resolved" | "closed";
  created_at: string;
  image?: string;
  image_path?: string;
  resolved_at?: string;
};
export type Profile = {
  email?: string;
  match_notifications?: boolean;
  id: string;
  display_name: string;
  role: "student" | "moderator";
  campus_id: string;
};
export type ClaimStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "completed";
export type Claim = {
  id: string;
  item_report_id: string;
  claimant_id: string;
  message: string;
  status: ClaimStatus;
  review_note: string;
  created_at: string;
  history: { status: ClaimStatus; at: string }[];
};
export type Notice = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  report_id: string;
  read: boolean;
  created_at: string;
};
export type Match = {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  reasons: string[];
};
export type Store = {
  requests?: Record<string, { id: string }>;
  reports: Report[];
  profiles: Profile[];
  claims: Claim[];
  notifications: Notice[];
  matches: Match[];
  flags: {
    id: string;
    report_id: string;
    reporter_id: string;
    reason: string;
    status: string;
  }[];
};
