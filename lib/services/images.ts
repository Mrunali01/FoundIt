import { unlink } from "node:fs/promises";
import path from "node:path";
import { transaction } from "./store";
import { isDemo, supabase } from "../supabase/server";
import { dataDirectory } from "../data-directory";
export async function removeUnusedImage(image: string, userId: string) {
  if (isDemo()) {
    const prefix = `/api/images/${userId}-`;
    if (
      !image.startsWith(prefix) ||
      !/^\/api\/images\/[a-f0-9-]+\.webp$/.test(image)
    )
      throw Error("Invalid image owner");
    const used = await transaction((s) =>
      s.reports.some((r) => r.image === image),
    );
    if (used) throw Error("Image is still attached to a report");
    try {
      await unlink(path.join(dataDirectory(), "images", path.basename(image)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  } else {
    if (!image.startsWith(userId + "/")) throw Error("Invalid image owner");
    const db = await supabase();
    const { data, error } = await db
      .from("item_reports")
      .select("id")
      .eq("image", image)
      .limit(1);
    if (error || data.length) throw Error("Image is still attached");
    const { error: removed } = await db.storage
      .from("item-images")
      .remove([image]);
    if (removed) throw Error("Image cleanup failed");
  }
}
