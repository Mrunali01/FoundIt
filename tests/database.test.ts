import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { students, seed } from "../lib/seed";
let db: PGlite;
const report = seed().reports[1];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  const migration = await readFile(
    "supabase/migrations/001_foundit.sql",
    "utf8",
  );
  await db.exec(
    migration.replace("create extension if not exists pgcrypto;", ""),
  );
  await db.exec(await readFile("supabase/migrations/002_search.sql", "utf8"));
  for (const student of students)
    await db.query("insert into auth.users values($1)", [student.id]);
  await db.query("update profiles set role='moderator' where id=$1", [
    students[2].id,
  ]);
  await db.query(
    `insert into item_reports(id,reporter_id,campus_id,type,title,description,category,location_label,event_date,color) values($1,$2,$3,'found',$4,$5,$6,$7,$8,$9)`,
    [
      report.id,
      report.reporter_id,
      report.campus_id,
      report.title,
      report.description,
      report.category,
      report.location_label,
      report.event_date,
      report.color,
    ],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function asUser(id: string, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
describe("PostgreSQL authorization and transactional recovery", () => {
  it("lets an authorized moderator close a report and consistently reject open claims", async () => {
    const fields = {
      ...seed().reports[3],
      type: "found",
      title: "Moderation test earbuds",
      image: "",
    };
    const created = await asUser(
      students[1].id,
      "select app_mutate('report',$1::jsonb) as result",
      [JSON.stringify(fields)],
    );
    const id = (created.rows[0] as { result: { id: string } }).result.id;
    await asUser(students[0].id, "select app_mutate('claim',$1::jsonb)", [
      JSON.stringify({
        report_id: id,
        message: "Private ownership evidence for the item",
      }),
    ]);
    await asUser(students[2].id, "select app_mutate('status',$1::jsonb)", [
      JSON.stringify({ id, status: "closed" }),
    ]);
    expect(
      (
        await asUser(
          students[0].id,
          "select status from claims where item_report_id=$1",
          [id],
        )
      ).rows,
    ).toEqual([{ status: "rejected" }]);
    await db.query("delete from item_reports where id=$1", [id]);
    await db.exec("delete from notifications");
  });
  it("allows profile preferences without accepting a supplied role", async () => {
    await asUser(students[0].id, "select app_mutate('profile',$1::jsonb)", [
      JSON.stringify({
        display_name: "Aarav (demo)",
        match_notifications: true,
        role: "moderator",
      }),
    ]);
    expect(
      (
        await asUser(
          students[0].id,
          "select role from profiles where id=auth.uid()",
        )
      ).rows,
    ).toEqual([{ role: "student" }]);
  });
  it("creates idempotent reports, persists explained matches, deduplicates notifications and searches", async () => {
    const body = {
      ...seed().reports[2],
      request_id: crypto.randomUUID(),
      title: "White wireless earbuds",
      description: "White wireless earbuds in charging case",
      image: "",
    };
    const first = await asUser(
      students[0].id,
      "select app_mutate('report',$1::jsonb) as result",
      [JSON.stringify(body)],
    );
    const second = await asUser(
      students[0].id,
      "select app_mutate('report',$1::jsonb) as result",
      [JSON.stringify(body)],
    );
    expect(first.rows).toEqual(second.rows);
    await asUser(students[1].id, "select app_mutate('report',$1::jsonb)", [
      JSON.stringify({
        ...body,
        type: "found",
        request_id: crypto.randomUUID(),
      }),
    ]);
    const matches = await asUser(
      students[0].id,
      "select score,reasons from item_matches",
    );
    expect(matches.rows).toHaveLength(1);
    expect((matches.rows[0] as { score: number }).score).toBeGreaterThanOrEqual(
      65,
    );
    const before = (await asUser(students[0].id, "select * from notifications"))
      .rows.length;
    await asUser(students[0].id, "select app_mutate('refresh','{}')");
    expect(
      (await asUser(students[0].id, "select * from notifications")).rows,
    ).toHaveLength(before);
    const search = await asUser(
      "",
      'select search_reports(\'{"q":"earbuds","limit":1}\') as result',
    );
    expect(
      (search.rows[0] as { result: { total: number; reports: unknown[] } })
        .result.total,
    ).toBe(2);
    expect(
      (search.rows[0] as { result: { reports: unknown[] } }).result.reports,
    ).toHaveLength(1);
    // Remove this isolated fixture before the subsequent recovery tests.
    await db.query(
      "delete from item_reports where title='White wireless earbuds'",
    );
    await db.exec("delete from notifications");
  });
  it("allows public active browsing but no private claims", async () => {
    const r = await asUser("", "select * from item_reports");
    expect(r.rows).toHaveLength(1);
    expect((await asUser("", "select * from claims")).rows).toHaveLength(0);
  });
  it("rejects direct role escalation", async () => {
    await expect(
      asUser(
        students[0].id,
        "update profiles set role='moderator' where id=auth.uid()",
      ),
    ).rejects.toThrow();
  });
  it("rejects foreign report edits", async () => {
    await expect(
      asUser(students[0].id, "select app_mutate('status',$1::jsonb)", [
        JSON.stringify({ id: report.id, status: "closed" }),
      ]),
    ).rejects.toThrow();
  });
  it("creates a private claim, denies self-approval and completes under owner control", async () => {
    const created = await asUser(
      students[0].id,
      "select app_mutate('claim',$1::jsonb) as result",
      [
        JSON.stringify({
          report_id: report.id,
          message: "Private stitching details inside the wallet",
        }),
      ],
    );
    const id = (created.rows[0] as { result: { id: string } }).result.id;
    expect((await asUser("", "select * from claims")).rows).toHaveLength(0);
    expect(
      (await asUser(students[0].id, "select * from claims")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(students[1].id, "select * from claims")).rows,
    ).toHaveLength(1);
    await expect(
      asUser(students[0].id, "select app_mutate('review',$1::jsonb)", [
        JSON.stringify({ id, status: "approved" }),
      ]),
    ).rejects.toThrow();
    await asUser(students[1].id, "select app_mutate('review',$1::jsonb)", [
      JSON.stringify({ id, status: "approved" }),
    ]);
    await asUser(students[1].id, "select app_mutate('review',$1::jsonb)", [
      JSON.stringify({ id, status: "completed" }),
    ]);
    expect(
      (
        await asUser(
          students[1].id,
          "select status from item_reports where id=$1",
          [report.id],
        )
      ).rows,
    ).toEqual([{ status: "resolved" }]);
    expect(
      (
        await asUser(students[0].id, "select status from claims where id=$1", [
          id,
        ])
      ).rows,
    ).toEqual([{ status: "completed" }]);
    expect(
      (await asUser(students[0].id, "select * from notifications")).rows,
    ).toHaveLength(2);
    expect((await asUser("", "select * from item_reports")).rows).toHaveLength(
      0,
    );
  });
});
