import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/services/auth";
import { isDemo, supabase } from "@/lib/supabase/server";
import { transaction } from "@/lib/services/store";
import { searchReports } from "@/lib/search";
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser(),
      p = req.nextUrl.searchParams;
    const own = p.get("own") === "true";
    if (own && !user)
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    if (isDemo())
      return NextResponse.json(
        await transaction((s) =>
          searchReports(
            s.reports.filter((r) =>
              own ? r.reporter_id === user?.id : r.status === "active",
            ),
            p,
          ),
        ),
      );
    const db = await supabase();
    const { data, error } = await db.rpc("search_reports", {
      filters: Object.fromEntries(p),
    });
    if (error) throw Error();
    for (const report of data.reports) {
      if (report.image) {
        const { data: signed } = await db.storage
          .from("item-images")
          .createSignedUrl(report.image, 300);
        report.image = signed?.signedUrl;
      }
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Search unavailable. Please retry." },
      { status: 503 },
    );
  }
}
