import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { students } from "../seed";
import { isDemo, supabase } from "../supabase/server";
import type { Profile } from "../types";
import { transaction } from "./store";
import { dataDirectory } from "../data-directory";
// Demo sessions are signed and are never accepted by the Supabase backend.
function sessionSecret() {
  if (process.env.DEMO_SESSION_SECRET) return process.env.DEMO_SESSION_SECRET;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "session-secret");
  try {
    writeFileSync(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return readFileSync(file, "utf8");
}
const sign = (id: string) =>
  createHmac("sha256", sessionSecret()).update(id).digest("hex");
export async function demoLogin(id: string) {
  if (!isDemo() || !students.some((p) => p.id === id))
    throw Error("Invalid demo account");
  (await cookies()).set("foundit_demo", `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 86400,
  });
}
export async function currentUser(): Promise<Profile | null> {
  if (isDemo()) {
    const value = (await cookies()).get("foundit_demo")?.value;
    if (!value) return null;
    const [id, signature] = value.split(".");
    const expected = sign(id);
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    return transaction((s) => s.profiles.find((p) => p.id === id) || null);
  }
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db
    .from("profiles")
    .select("id,display_name,role,campus_id,match_notifications")
    .eq("id", user.id)
    .single();
  return data ? ({ ...data, email: user.email } as Profile) : null;
}
