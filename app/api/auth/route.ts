import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { demoLogin } from "@/lib/services/auth";
import { isDemo, supabase } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/request";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const b = await req.json();
    if (b.action === "logout") {
      (await cookies()).delete("foundit_demo");
      if (!isDemo()) await (await supabase()).auth.signOut();
      return NextResponse.json({ ok: true });
    }
    if (isDemo()) {
      await demoLogin(String(b.id));
      return NextResponse.json({ ok: true });
    }
    const db = await supabase();
    const { error } =
      b.action === "signup"
        ? await db.auth.signUp({
            email: b.email,
            password: b.password,
            options: {
              emailRedirectTo: `${req.headers.get("origin")}/auth/confirm`,
            },
          })
        : b.action === "reset"
          ? await db.auth.resetPasswordForEmail(b.email, {
              redirectTo: `${req.headers.get("origin")}/auth/confirm`,
            })
          : b.action === "password"
            ? await db.auth.updateUser({ password: b.password })
            : await db.auth.signInWithPassword({
                email: b.email,
                password: b.password,
              });
    if (error)
      throw Error(
        "Authentication failed. Check your details or email for confirmation.",
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to sign in. Check your account details." },
      { status: 400 },
    );
  }
}
