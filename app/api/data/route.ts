import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/services/auth";
import { transaction, refreshMatches } from "@/lib/services/store";
import { isDemo, supabase } from "@/lib/supabase/server";
import { reportSchema, claimSchema } from "@/lib/validation";
import { reviewClaim } from "@/lib/services/workflows";
import type { ClaimStatus } from "@/lib/types";
import { sameOrigin } from "@/lib/request";
import { visibleSnapshot } from "@/lib/services/snapshot";
import type { Store } from "@/lib/types";
import { removeUnusedImage } from "@/lib/services/images";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!isDemo()) {
    const db = await supabase();
    const { data, error } = await db.rpc("app_snapshot");
    if (error)
      return NextResponse.json(
        { error: "Unable to load campus data" },
        { status: 503 },
      );
    for (const report of data.reports) {
      if (report.image) {
        report.image_path = report.image;
        const { data: signed } = await db.storage
          .from("item-images")
          .createSignedUrl(report.image, 300);
        report.image = signed?.signedUrl;
      }
    }
    return NextResponse.json({
      ...visibleSnapshot(
        data as Store,
        user,
        req.nextUrl.searchParams.get("report"),
      ),
      user,
      mode: "supabase",
    });
  }
  return NextResponse.json(
    await transaction((s) => ({
      ...visibleSnapshot(s, user, req.nextUrl.searchParams.get("report")),
      user,
      mode: "demo",
    })),
  );
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "Please sign in first" },
        { status: 401 },
      );
    const body = await request.json();
    if (!isDemo()) {
      const db = await supabase();
      const previous =
        body.action === "edit"
          ? await db
              .from("item_reports")
              .select("image")
              .eq("id", body.id)
              .eq("reporter_id", user.id)
              .single()
          : null;
      if (body.action === "report" || body.action === "edit")
        reportSchema.parse(body);
      if (body.action === "claim") claimSchema.parse(body);
      const { data, error } = await db.rpc("app_mutate", {
        operation: body.action,
        payload: body,
      });
      if (error)
        throw Error(
          "The operation could not be completed. Check permissions and current status.",
        );
      if (previous?.data?.image && previous.data.image !== body.image) {
        try {
          await removeUnusedImage(previous.data.image, user.id);
        } catch {
          console.warn("Image cleanup deferred");
        }
      }
      return NextResponse.json(data);
    }
    const result = await transaction((s) => {
      const requestKey =
        body.action === "report" &&
        typeof body.request_id === "string" &&
        /^[a-f0-9-]{36}$/.test(body.request_id)
          ? `${user.id}:${body.request_id}`
          : null;
      if (requestKey && s.requests?.[requestKey]) return s.requests[requestKey];
      switch (body.action) {
        case "profile": {
          if (
            typeof body.display_name !== "string" ||
            body.display_name.trim().length < 1 ||
            body.display_name.length > 80
          )
            throw Error("Use a display name between 1 and 80 characters");
          const p = s.profiles.find((p) => p.id === user.id)!;
          p.display_name = body.display_name.trim();
          p.match_notifications = body.match_notifications !== false;
          return { ok: true };
        }
        case "report": {
          const fields = reportSchema.parse(body);
          const id = crypto.randomUUID();
          s.reports.unshift({
            ...fields,
            id,
            reporter_id: user.id,
            campus_id: user.campus_id,
            status: "active",
            created_at: new Date().toISOString(),
            image:
              typeof body.image === "string" &&
              new RegExp(`^/api/images/${user.id}-[a-f0-9-]+\\.webp$`).test(
                body.image,
              )
                ? body.image
                : undefined,
          });
          refreshMatches(s);
          if (requestKey) {
            s.requests ??= {};
            s.requests[requestKey] = { id };
          }
          return { id };
        }
        case "claim": {
          const input = claimSchema.parse(body);
          const r = s.reports.find(
            (r) => r.id === input.report_id && r.campus_id === user.campus_id,
          );
          if (
            !r ||
            r.type !== "found" ||
            r.status !== "active" ||
            r.reporter_id === user.id
          )
            throw Error("This item is not eligible for your claim");
          if (
            s.claims.some(
              (c) =>
                c.item_report_id === r.id &&
                c.claimant_id === user.id &&
                !["rejected", "withdrawn"].includes(c.status),
            )
          )
            throw Error("You already have an active claim");
          const id = crypto.randomUUID(),
            at = new Date().toISOString();
          s.claims.push({
            id,
            item_report_id: r.id,
            claimant_id: user.id,
            message: input.message,
            status: "pending",
            review_note: "",
            created_at: at,
            history: [{ status: "pending", at }],
          });
          s.notifications.push({
            id: crypto.randomUUID(),
            user_id: r.reporter_id,
            title: "New ownership claim",
            body: `A student submitted private evidence for ${r.title}.`,
            report_id: r.id,
            read: false,
            created_at: at,
          });
          return { id };
        }
        case "review":
          reviewClaim(
            s,
            user,
            String(body.id),
            body.status as ClaimStatus,
            String(body.note || "").slice(0, 2000),
          );
          refreshMatches(s);
          return { ok: true };
        case "status": {
          const r = s.reports.find(
            (r) => r.id === body.id && r.campus_id === user.campus_id,
          );
          if (!r || (r.reporter_id !== user.id && user.role !== "moderator"))
            throw Error("You cannot change this report");
          if (
            r.status !== "active" ||
            !["closed", "resolved"].includes(body.status)
          )
            throw Error("Invalid report transition");
          if (r.type === "found" && body.status === "resolved")
            throw Error(
              "Complete the approved claim handover to return a found item",
            );
          if (
            s.claims.some(
              (c) =>
                c.item_report_id === r.id &&
                ["pending", "under_review", "approved"].includes(c.status),
            ) &&
            !(user.role === "moderator" && body.status === "closed")
          )
            throw Error(
              "Review or withdraw open claims before closing this report",
            );
          r.status = body.status;
          const at = new Date().toISOString();
          if (user.role === "moderator" && body.status === "closed")
            for (const c of s.claims.filter(
              (c) =>
                c.item_report_id === r.id &&
                ["pending", "under_review", "approved"].includes(c.status),
            )) {
              c.status = "rejected";
              c.history.push({ status: "rejected", at });
              s.notifications.push({
                id: crypto.randomUUID(),
                user_id: c.claimant_id,
                title: "Claim closed by moderator",
                body: "The associated report was removed from the noticeboard.",
                report_id: r.id,
                read: false,
                created_at: at,
              });
            }
          s.notifications.push({
            id: crypto.randomUUID(),
            user_id: r.reporter_id,
            title:
              body.status === "resolved" ? "Report resolved" : "Report closed",
            body:
              user.id === r.reporter_id
                ? "Your report has been updated."
                : "A campus moderator closed your report.",
            report_id: r.id,
            read: false,
            created_at: at,
          });
          refreshMatches(s);
          return { ok: true };
        }
        case "edit": {
          const r = s.reports.find(
            (r) =>
              r.id === body.id &&
              r.reporter_id === user.id &&
              r.status === "active",
          );
          if (!r) throw Error("This report cannot be edited");
          Object.assign(r, reportSchema.parse(body));
          const oldImage = r.image;
          if (
            typeof body.image === "string" &&
            (body.image === "" ||
              new RegExp(`^/api/images/${user.id}-[a-f0-9-]+\\.webp$`).test(
                body.image,
              ))
          )
            r.image = body.image || undefined;
          refreshMatches(s);
          return {
            id: r.id,
            delete_image: oldImage !== r.image ? oldImage : undefined,
          };
        }
        case "read":
          for (const n of s.notifications.filter((n) => n.user_id === user.id))
            n.read = true;
          return { ok: true };
        case "refresh":
          refreshMatches(s);
          return { ok: true };
        case "flag": {
          if (
            typeof body.reason !== "string" ||
            body.reason.trim().length < 5 ||
            !s.reports.some(
              (r) => r.id === body.id && r.campus_id === user.campus_id,
            )
          )
            throw Error("Provide a reason for an available report");
          s.flags.push({
            id: crypto.randomUUID(),
            report_id: body.id,
            reporter_id: user.id,
            reason: body.reason.slice(0, 1000),
            status: "pending",
          });
          return { ok: true };
        }
        case "moderate": {
          if (user.role !== "moderator")
            throw Error("Moderator access required");
          const f = s.flags.find((f) => f.id === body.id);
          if (!f) throw Error("Flag unavailable");
          f.status = "reviewed";
          return { ok: true };
        }
        default:
          throw Error("Unknown action");
      }
    });
    if ("delete_image" in result && typeof result.delete_image === "string") {
      try {
        await removeUnusedImage(result.delete_image, user.id);
      } catch {
        console.warn("Image cleanup deferred");
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.name === "Error" && !("code" in e)
            ? e.message
            : "Please check the form fields",
      },
      { status: 400 },
    );
  }
}
