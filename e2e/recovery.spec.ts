import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", { name: /welcome back/ }),
  ).toBeVisible();
}
test("report, match, privately claim and complete a recovery", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    finder = await browser.newContext();
  const a = await owner.newPage(),
    b = await finder.newPage();
  await login(a, "Aarav");
  const title = `Copper travel flask ${Date.now()}`;
  await a.goto("/report/lost");
  await a.getByLabel("What’s the item?").fill(title);
  await a
    .getByLabel("Category", { exact: true })
    .selectOption("Water bottles and containers");
  await a.getByLabel("Date lost").fill("2026-10-20");
  await a
    .getByLabel("Description", { exact: true })
    .fill("Copper travel flask with a small dent in the base");
  await a.getByRole("button", { name: "Publish lost report" }).click();
  await expect(
    a.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await a.goto("/my-reports");
  await expect(
    a.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await login(b, "Meera");
  await b.goto("/report/found");
  await b.getByLabel("What’s the item?").fill(title + " found");
  await b
    .getByLabel("Category", { exact: true })
    .selectOption("Water bottles and containers");
  await b.getByLabel("Date found").fill("2026-10-20");
  await b
    .getByLabel("Description", { exact: true })
    .fill("Picked up copper travel flask with small dent near its base");
  await b.getByRole("button", { name: "Publish found report" }).click();
  await expect(
    b
      .locator(".match")
      .filter({ hasText: title })
      .getByText("Similar item titles"),
  ).toBeVisible();
  const url = b.url().split("?")[0];
  await a.goto(url);
  await a
    .getByLabel("Private ownership evidence")
    .fill("The base has my initials scratched beside the dent.");
  await a.getByRole("button", { name: "Submit a private claim" }).click();
  await expect(
    a
      .locator(".claim-card")
      .filter({ hasText: title })
      .getByText("The base has my initials scratched beside the dent."),
  ).toBeVisible();
  await b.goto("/claims");
  const claim = b.locator(".claim-card").filter({ hasText: title });
  b.on("dialog", async (d) =>
    d.type() === "confirm" ? d.accept() : d.accept("Meet at campus security"),
  );
  await claim.getByRole("button", { name: "Approve claim" }).click();
  await expect(claim.getByText("approved", { exact: true })).toBeVisible();
  await claim
    .getByRole("button", { name: "Confirm completed handover" })
    .click();
  await expect(claim.getByText("completed", { exact: true })).toBeVisible();
  await b.goto(url);
  await expect(b.getByText("found · resolved")).toBeVisible();
  await owner.close();
  await finder.close();
});
test("landing renders at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Lost something/ }),
  ).toBeVisible();
  await page.screenshot({ path: ".tools/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".tools/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("backend rejects unauthorized mutation and private claim access", async ({
  page,
}) => {
  await login(page, "Aarav");
  const snapshot = await (await page.request.get("/api/data")).json();
  const foreign = snapshot.reports.find(
    (r: { reporter_id: string; type: string }) =>
      r.reporter_id !== snapshot.user.id && r.type === "found",
  );
  const result = await page.request.post("/api/data", {
    headers: { origin: "http://127.0.0.1:3107" },
    data: { action: "status", id: foreign.id, status: "closed" },
  });
  expect(result.status()).toBe(400);
  const mod = await page.request.post("/api/data", {
    headers: { origin: "http://127.0.0.1:3107" },
    data: { action: "moderate", id: crypto.randomUUID() },
  });
  expect(mod.status()).toBe(400);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Moderator access required" }),
  ).toBeVisible();
  const publicContext = await page.context().browser()!.newContext();
  const publicPage = await publicContext.newPage();
  const publicData = await (await publicPage.request.get("/api/data")).json();
  expect(publicData.claims).toEqual([]);
  expect(publicData.notifications).toEqual([]);
  await publicContext.close();
});
test("mobile layout has no horizontal overflow and search filters work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");
  await page.getByRole("textbox", { name: "Search reports" }).fill("wallet");
  await expect(
    page.getByRole("heading", { name: "Black leather wallet", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Search reports" })
    .fill("zxqvneverexists93847");
  await expect(
    page.getByRole("heading", { name: "No items here yet" }),
  ).toBeVisible();
});
