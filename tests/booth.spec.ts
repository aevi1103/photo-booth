import { expect, test } from "@playwright/test";

test("camera preview, countdown, frame, download and retake work", async ({ page }) => {
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "[]" });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to the baby shower!" })).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(300);
  await page.getByLabel("Add a baby-shower frame").check();
  await page.getByRole("button", { name: "Take a photo" }).click();
  await expect(page.getByAltText("Your captured photo")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Not saved online:", { exact: false })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download photo" }).click();
  expect((await download).suggestedFilename()).toBe("baby-shower.jpg");
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeVisible();
});

test("photo endpoint rejects missing code, wrong media type, and invalid JPEG", async ({ request }) => {
  const invalidCode = await request.post("/api/photos", { headers: { "content-type": "image/jpeg" }, data: "x" });
  expect(invalidCode.status()).toBe(401);
  const invalidType = await request.post("/api/photos", { headers: { "x-booth-code": "test-long-upload-code", "content-type": "text/plain" }, data: "x" });
  expect(invalidType.status()).toBe(415);
  const invalidImage = await request.post("/api/photos", { headers: { "x-booth-code": "test-long-upload-code", "content-type": "image/jpeg" }, data: "x" });
  expect(invalidImage.status()).toBe(400);
});

test("green screen is replaced without removing a red subject", async ({ page }) => {
  await page.addInitScript(() => {
    const source = document.createElement("canvas");
    source.width = 320; source.height = 180;
    const ctx = source.getContext("2d")!;
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = source.captureStream(10);
      const paint = () => {
        ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, 160, 180);
        ctx.fillStyle = "#ff0000"; ctx.fillRect(160, 0, 160, 180);
        requestAnimationFrame(paint);
      };
      paint();
      return stream;
    };
  });
  await page.route("http://127.0.0.1:9999/rest/v1/backgrounds**", async (route) => {
    await route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify([{ id: "1", name: "Blue sky", path: "blue.svg" }]) });
  });
  await page.route("http://127.0.0.1:9999/storage/v1/object/public/backgrounds/blue.svg", async (route) => {
    await route.fulfill({ contentType: "image/svg+xml", headers: { "Access-Control-Allow-Origin": "*" }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="blue"/></svg>' });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await expect.poll(async () => page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
    const output = document.createElement("canvas"); output.width = source.width; output.height = source.height;
    const ctx = output.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const greenSide = ctx.getImageData(80, 90, 1, 1).data;
    const redSide = ctx.getImageData(240, 90, 1, 1).data;
    return greenSide[2] > 200 && greenSide[1] < 30 && redSide[0] > 200 && redSide[2] < 30;
  })).toBe(true);
});

test("admin signs in and loads private management views", async ({ page }) => {
  const user = { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "host@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.route("http://127.0.0.1:9999/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let data: unknown = [];
    if (url.pathname === "/auth/v1/token") data = { access_token: "mock-token", refresh_token: "mock-refresh", expires_in: 3600, token_type: "bearer", user };
    if (url.pathname === "/auth/v1/user") data = user;
    if (url.pathname === "/rest/v1/rpc/is_booth_admin") data = true;
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/admin");
  await page.getByLabel("EMAIL").fill("host@example.test");
  await page.getByLabel("PASSWORD").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Private photo gallery" })).toBeVisible();
  await expect(page.getByText("No photos saved yet.")).toBeVisible();
});
