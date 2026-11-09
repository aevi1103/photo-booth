import { test, expect, userId, otherId, adminId, sessionCookie } from "./fixtures";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const upload = { headers: { "content-type": "image/jpeg" }, data: jpeg };

test("anonymous users must sign in before booth, gallery, quota, and uploads", async ({ page, playwright }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await page.goto("/gallery");
  await expect(page).toHaveURL(/\/login$/);
  const anonymous = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [], origins: [] } });
  try {
    for (const path of ["/api/photos", "/api/account"]) {
      expect((await anonymous.get(path)).status()).toBe(401);
    }
    expect((await anonymous.post("/api/photos", { ...upload, headers: { ...upload.headers, "x-booth-code": "old-code" } })).status()).toBe(401);
  } finally { await anonymous.dispose(); }
});

test("Google OAuth uses PKCE, writes HttpOnly cookies and returns only to the booth", async ({ request }) => {
  const start = await request.get("/auth/login", { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const location = new URL(start.headers().location);
  expect(location.pathname).toBe("/auth/v1/authorize");
  expect(location.searchParams.get("provider")).toBe("google");
  expect(location.searchParams.get("redirect_to")).toBe("http://127.0.0.1:3210/auth/callback");
  expect(location.searchParams.get("code_challenge")).toBeTruthy();
  expect(start.headers()["set-cookie"]).toContain("HttpOnly");
  const callback = await request.get("/auth/callback?code=test-code&next=https://example.com", { maxRedirects: 0 });
  expect(callback.headers().location).toBe("http://127.0.0.1:3210/");
  expect(callback.headers()["set-cookie"]).toContain("HttpOnly");
  const failed = await request.get("/auth/callback?error=access_denied", { maxRedirects: 0 });
  expect(failed.headers().location).toContain("/login?error=signin");
});

test("sign out removes access and rejects cross-origin signout", async ({ page, request }) => {
  expect((await request.post("/auth/logout", { headers: { origin: "https://example.com" } })).status()).toBe(403);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("expired sessions refresh on the server and cross-origin uploads are rejected", async ({ playwright, request }) => {
  const cookie = sessionCookie(userId, -60);
  cookie.expires = Math.floor(Date.now() / 1000) + 3600;
  const expired = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [cookie], origins: [] } });
  try {
    const result = await expired.get("/api/account");
    expect(result.status()).toBe(200);
    expect(result.headers()["set-cookie"]).toContain("HttpOnly");
    expect(result.headers()["cache-control"]).toContain("no-store");
  } finally { await expired.dispose(); }
  expect((await request.post("/api/photos", { ...upload, headers: { ...upload.headers, origin: "https://example.com" } })).status()).toBe(403);
});

test("database profiles ignore metadata admin claims and cannot be self-promoted", async ({ request, backend }) => {
  const account = await request.get("/api/account");
  expect(await account.json()).toMatchObject({ quota: { role: "user", used: 0, remaining: 20, limit: 20 } });
  const permissions = await backend.db.query<{ can_update: boolean; can_reserve: boolean }>(`
    select has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as can_update,
    has_function_privilege('authenticated', 'public.reserve_photo_upload(uuid)', 'EXECUTE') as can_reserve;
  `);
  expect(permissions.rows[0]).toEqual({ can_update: false, can_reserve: false });
  await expect(backend.db.exec(`set role authenticated; update public.profiles set role = 'admin' where id = '${userId}';`)).rejects.toThrow(/permission denied/);
  await backend.db.exec("reset role;");
  await backend.db.exec(`update public.profiles set role = 'admin' where id = '${userId}';`);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { role: "admin", limit: null, remaining: null } });
});

test("concurrent uploads allow exactly 20 total per user across sessions", async ({ request, backend, playwright }) => {
  const results = await Promise.all(Array.from({ length: 25 }, () => request.post("/api/photos", upload)));
  expect(results.filter((result) => result.status() === 200)).toHaveLength(20);
  expect(results.filter((result) => result.status() === 409)).toHaveLength(5);
  expect(backend.objects.size).toBe(20);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 20, remaining: 0 } });
  const secondSession = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie()], origins: [] } });
  try { expect((await secondSession.post("/api/photos", upload)).status()).toBe(409); }
  finally { await secondSession.dispose(); }
});

test("Vercel-safe photo limit accepts 4 MiB and rejects one byte over without consuming quota", async ({ request, backend }) => {
  const image = Buffer.alloc(4 * 1024 * 1024, 0);
  image.set([0xff, 0xd8, 0xff], 0);
  image.set([0xff, 0xd9], image.length - 2);
  const tooLarge = await request.post("/api/photos", { headers: upload.headers, data: Buffer.concat([image, Buffer.from([0])]) });
  expect(tooLarge.status()).toBe(413);
  expect(await tooLarge.json()).toHaveProperty("error", "Photo exceeds the 4 MB upload limit. Download it as a backup.");
  expect(backend.objects.size).toBe(0);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 0 } });
  expect((await request.post("/api/photos", { headers: upload.headers, data: image })).status()).toBe(200);
  expect([...backend.objects.values()][0].length).toBe(4 * 1024 * 1024);
});

test("admins can save beyond 20 and other users have separate allowances", async ({ backend, playwright }) => {
  const admin = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie(adminId)], origins: [] } });
  const other = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie(otherId)], origins: [] } });
  try {
    const results = await Promise.all(Array.from({ length: 22 }, () => admin.post("/api/photos", upload)));
    expect(results.every((result) => result.status() === 200)).toBe(true);
    expect(await (await admin.get("/api/account")).json()).toMatchObject({ quota: { role: "admin", used: 22, limit: null, remaining: null } });
    expect((await other.post("/api/photos", upload)).status()).toBe(200);
    expect(await (await other.get("/api/account")).json()).toMatchObject({ quota: { used: 1, remaining: 19 } });
    expect(backend.objects.size).toBe(23);
  } finally { await admin.dispose(); await other.dispose(); }
});

test("failed uploads release definite failures but retain uncertain reservations", async ({ request, backend }) => {
  backend.storageError = 400;
  expect((await request.post("/api/photos", upload)).status()).toBe(503);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 0, remaining: 20 } });
  backend.storageError = 500;
  expect((await request.post("/api/photos", upload)).status()).toBe(503);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 1, remaining: 19 } });
  backend.storageError = null;
  expect((await request.post("/api/photos", upload)).status()).toBe(200);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 2, remaining: 18 } });
});

test("gallery isolates users while admins can view all including legacy photos", async ({ request, backend, playwright }) => {
  await backend.db.query("insert into storage.objects(bucket_id, name) values ('photos', $1), ('photos', $2), ('photos', 'legacy.jpg')", [`${userId}/mine.jpg`, `${otherId}/other.jpg`]);
  const mine = await (await request.get("/api/photos")).json();
  expect(mine.photos.map((photo: { name: string }) => photo.name)).toEqual([`${userId}/mine.jpg`]);
  const admin = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie(adminId)], origins: [] } });
  try {
    expect((await (await admin.get("/api/photos")).json()).photos).toHaveLength(3);
  } finally { await admin.dispose(); }
});

test("database migration is rerunnable, preserves admin roles and denies direct Storage bypass", async ({ backend }) => {
  const { readFile } = await import("node:fs/promises");
  await backend.db.exec(await readFile("supabase\\setup.sql", "utf8"));
  const admin = await backend.db.query<{ role: string }>("select role from public.profiles where id = $1", [adminId]);
  expect(admin.rows[0].role).toBe("admin");
  await backend.db.exec(`
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant insert, select on storage.objects to anon, authenticated;
    create policy test_old_permissive_policy on storage.objects for all to anon, authenticated using (true) with check (true);
  `);
  for (const role of ["anon", "authenticated"]) {
    await backend.db.exec(`set role ${role};`);
    await expect(backend.db.exec("insert into storage.objects(bucket_id, name) values ('photos', 'bypass.jpg');")).rejects.toThrow(/row-level security/);
    await backend.db.exec("reset role;");
  }
  await backend.db.exec("drop policy test_old_permissive_policy on storage.objects;");
});

test("booth shows last upload and disables manual and voice capture at zero", async ({ page, backend }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onresult: ((event: object) => void) | null = null;
      onerror: ((event: object) => void) | null = null;
      onend: (() => void) | null = null;
      start() { this.onstart?.(); }
      abort() { this.onend?.(); }
      constructor() { Object.assign(window, { quotaRecognition: this }); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await backend.db.exec(`insert into public.photo_uploads(id, user_id, path, status)
    select gen_random_uuid(), '${userId}', 'previous/' || i || '.jpg', 'uploaded' from generate_series(1, 19) i;`);
  await page.goto("/");
  await expect(page.getByText("1 of 20 photo uploads remaining")).toBeVisible();
  await expect(page.getByText("PHOTO UPLOAD CODE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Take a photo" }).click();
  await expect(page.getByText("Saved privately for the host.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("0 of 20 photo uploads remaining")).toBeVisible();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeDisabled();
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await page.evaluate(() => {
    const recognition = (window as Window & { quotaRecognition?: { onresult: (event: object) => void } }).quotaRecognition;
    if (!recognition) throw new Error("Quota voice test recognition is missing.");
    recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "capture" } }] });
  });
  await expect(page.getByRole("button", { name: "Get ready", exact: false })).toHaveCount(0);
  expect(backend.objects.size).toBe(1);
});

test("admin booth shows unlimited allowance and unavailable quota fails closed", async ({ page, backend }) => {
  await page.context().clearCookies();
  await page.context().addCookies([sessionCookie(adminId)]);
  await page.goto("/");
  await expect(page.getByText("Admin account · Unlimited photo uploads")).toBeVisible();
  await backend.db.query("delete from public.profiles where id = $1", [adminId]);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "upload allowance" })).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry allowance" })).toBeVisible();
});
