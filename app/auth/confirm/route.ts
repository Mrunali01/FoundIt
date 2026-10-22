import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/server";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash"),
    type = req.nextUrl.searchParams.get("type");
  if (tokenHash && (type === "email" || type === "recovery")) {
    const { error } = await (
      await supabase()
    ).auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL("/settings", req.url));
  }
  if (code) {
    const { error } = await (
      await supabase()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/settings?recovery=1", req.url));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", req.url));
}
