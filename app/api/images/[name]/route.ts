import { readFile } from "node:fs/promises";
import path from "node:path";
import { transaction } from "@/lib/services/store";
import { isDemo } from "@/lib/supabase/server";
import { dataDirectory } from "@/lib/data-directory";
import { currentUser } from "@/lib/services/auth";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!isDemo() || !/^[\w-]+\.webp$/.test(name))
    return new Response(null, { status: 404 });
  const user = await currentUser();
  const visible = await transaction((s) =>
    s.reports.some(
      (r) =>
        r.image === `/api/images/${name}` &&
        (r.status === "active" ||
          r.reporter_id === user?.id ||
          user?.role === "moderator" ||
          s.claims.some(
            (c) => c.item_report_id === r.id && c.claimant_id === user?.id,
          )),
    ),
  );
  if (!visible) return new Response(null, { status: 404 });
  try {
    return new Response(
      await readFile(path.join(dataDirectory(), "images", name)),
      {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
