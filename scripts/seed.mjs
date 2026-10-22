import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { seed, students } from "../lib/seed.ts";
import { scorePair } from "../lib/matching.ts";
const state = seed();
for (const lost of state.reports.filter((r) => r.type === "lost"))
  for (const found of state.reports.filter((r) => r.type === "found")) {
    const score = scorePair(lost, found);
    if (score && score.score >= 40)
      state.matches.push({
        id: `${lost.id}:${found.id}`,
        lost_report_id: lost.id,
        found_report_id: found.id,
        ...score,
      });
  }
for (const match of state.matches.filter((m) => m.score >= 65))
  for (const report of state.reports.filter(
    (r) => r.id === match.lost_report_id || r.id === match.found_report_id,
  ))
    state.notifications.push({
      id: `match:${match.id}:${report.reporter_id}`,
      user_id: report.reporter_id,
      title: "A possible match is waiting",
      body: `${match.score} similarity score. Review private ownership evidence before a handover.`,
      report_id: report.id,
      read: false,
      created_at: report.created_at,
    });
if (process.argv.includes("--supabase")) {
  if (
    process.env.ALLOW_DEMO_SEED !== "true" ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.DEMO_SEED_PASSWORD ||
    process.env.DEMO_SEED_PASSWORD.length < 12
  )
    throw Error(
      "Use a disposable Supabase project. Set ALLOW_DEMO_SEED=true, URL, service-role key, and a DEMO_SEED_PASSWORD of at least 12 characters.",
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const ids = new Map();
  for (const [i, student] of students.entries()) {
    const email = ["aarav", "meera", "moderator"][i] + ".demo@foundit.example";
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: process.env.DEMO_SEED_PASSWORD,
      email_confirm: true,
    });
    if (error)
      throw Error(
        "Cannot create fictional seed accounts. Use a clean test project.",
      );
    ids.set(student.id, data.user.id);
    const update = await db
      .from("profiles")
      .update({ display_name: student.display_name })
      .eq("id", data.user.id);
    if (update.error) throw update.error;
  }
  const reports = state.reports.map((r) => ({
    ...r,
    reporter_id: ids.get(r.reporter_id),
  }));
  const { error } = await db.from("item_reports").insert(reports);
  if (error) throw error;
  const claims = await db
    .from("claims")
    .insert(
      state.claims.map((c) => ({ ...c, claimant_id: ids.get(c.claimant_id) })),
    );
  if (claims.error) throw claims.error;
  // Refresh is intentionally not available to browsers; the first signed-in
  // user's explicit Refresh matches action runs it through the authorized RPC.
  console.log(
    "Seeded 20 reports and four example claims. Sign in with the fictional .example accounts and your configured seed password. Grant the moderator role separately using the README SQL.",
  );
} else {
  await mkdir(".data", { recursive: true });
  let exists = false;
  try {
    await readFile(".data/demo.json");
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (exists && !process.argv.includes("--reset"))
    throw Error(
      "Demo data already exists. Stop the server and use npm run seed -- --reset only if you intend to replace it.",
    );
  await writeFile(".data/demo.json", JSON.stringify(state));
  console.log(
    "Seeded 20 fictional reports, four claims and deterministic matches into .data/demo.json.",
  );
}
