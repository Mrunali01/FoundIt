import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { currentUser } from "@/lib/services/auth";
import { isDemo, supabase } from "@/lib/supabase/server";
import { sameOrigin } from "@/lib/request";
import { removeUnusedImage } from "@/lib/services/images";
import { dataDirectory } from "@/lib/data-directory";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    if (Number(req.headers.get("content-length")) > 6 * 1024 * 1024)
      throw Error();
    const form = await req.formData(),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      throw Error();
    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source, {
      limitInputPixels: 25000000,
    }).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format)) throw Error();
    const bytes = await sharp(source, {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const name = `${user.id}-${crypto.randomUUID()}.webp`;
    if (isDemo()) {
      const dir = path.join(dataDirectory(), "images");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), bytes);
      return NextResponse.json({ path: `/api/images/${name}` });
    }
    const db = await supabase();
    const key = `${user.id}/${name}`;
    const { error } = await db.storage
      .from("item-images")
      .upload(key, bytes, { contentType: "image/webp" });
    if (error) throw Error();
    return NextResponse.json({ path: key });
  } catch {
    return NextResponse.json(
      { error: "Upload failed. Use a JPEG, PNG or WebP under 5 MB." },
      { status: 400 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const b = await req.json();
    await removeUnusedImage(String(b.path), user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to remove image" },
      { status: 400 },
    );
  }
}
