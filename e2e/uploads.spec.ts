import { test, expect } from "@playwright/test";
import sharp from "sharp";
const origin = "http://127.0.0.1:3107";
test("uploaded images are validated, owned, persisted and cleaned up on edit", async ({
  request,
  browser,
}) => {
  await request.post("/api/auth", {
    headers: { origin },
    data: { id: "22222222-2222-4222-8222-222222222222" },
  });
  const bad = await request.post("/api/images", {
    headers: { origin },
    multipart: {
      file: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      },
    },
  });
  expect(bad.status()).toBe(400);
  const buffer = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#224466" },
  })
    .png()
    .toBuffer();
  const upload = await request.post("/api/images", {
    headers: { origin },
    multipart: { file: { name: "photo.png", mimeType: "image/png", buffer } },
  });
  expect(upload.ok()).toBe(true);
  const image = (await upload.json()).path;
  expect((await request.get(image)).status()).toBe(404);
  const report = {
    action: "report",
    type: "lost",
    title: "Test upload bottle",
    description: "A blue bottle with a silver lid from the library",
    category: "Water bottles and containers",
    color: "blue",
    brand: "",
    location_label: "Central Library",
    event_date: "2026-10-20",
    image,
    request_id: crypto.randomUUID(),
  };
  const created = await request.post("/api/data", {
    headers: { origin },
    data: report,
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  const repeated = await request.post("/api/data", {
    headers: { origin },
    data: report,
  });
  expect((await repeated.json()).id).toBe(id);
  const read = await request.get(image);
  expect(read.status()).toBe(200);
  expect(read.headers()["content-type"]).toBe("image/webp");
  const unrelated = await browser.newContext();
  const foreign = unrelated.request;
  await foreign.post("/api/auth", {
    headers: { origin },
    data: { id: "33333333-3333-4333-8333-333333333333" },
  });
  const deletion = await foreign.delete("/api/images", {
    headers: { origin },
    data: { path: image },
  });
  expect(deletion.status()).toBe(400);
  const edited = await request.post("/api/data", {
    headers: { origin },
    data: { ...report, action: "edit", id, image: "" },
  });
  expect(edited.ok()).toBe(true);
  expect((await request.get(image)).status()).toBe(404);
  await unrelated.close();
});
