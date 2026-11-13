import { test, expect, userId, otherId, adminId, sessionCookie } from "./fixtures";
import { readFile } from "node:fs/promises";

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
  await page.goto("/admin/backdrops");
  await expect(page).toHaveURL(/\/login$/);
  const anonymous = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [], origins: [] } });
  try {
    for (const path of ["/api/photos", "/api/account", "/api/backdrops"]) {
      expect((await anonymous.get(path)).status()).toBe(401);
    }
    expect((await anonymous.delete(`/api/photos?name=${userId}/photo.jpg`)).status()).toBe(401);
    expect((await anonymous.post("/api/photos", { ...upload, headers: { ...upload.headers, "x-booth-code": "old-code" } })).status()).toBe(401);
    expect((await anonymous.post("/api/backdrops", upload)).status()).toBe(401);
    expect((await anonymous.patch("/api/backdrops", { data: { file: "backdrop.jpg", hidden: true } })).status()).toBe(401);
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
  await page.getByRole("button", { name: "Menu", exact: true }).click();
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

test("photo deletion is owner/admin scoped and does not restore upload quota", async ({ request, backend, playwright }) => {
  expect((await request.post("/api/photos", upload)).status()).toBe(200);
  const ownName = (await (await request.get("/api/photos")).json()).photos[0].name as string;
  const otherName = `${otherId}/other.jpg`;
  await backend.db.query("insert into storage.objects(bucket_id, name) values ('photos', $1)", [otherName]);
  backend.objects.set(otherName, jpeg);

  expect((await request.delete(`/api/photos?name=${encodeURIComponent(ownName)}`, { headers: { origin: "https://example.com" } })).status()).toBe(403);
  expect((await request.delete(`/api/photos?name=${encodeURIComponent(`${userId}/../${otherName}`)}`)).status()).toBe(400);
  expect((await request.delete(`/api/photos?name=${encodeURIComponent(otherName)}`)).status()).toBe(404);
  expect(backend.objects.has(otherName)).toBe(true);

  const deleted = await request.delete(`/api/photos?name=${encodeURIComponent(ownName)}`);
  expect(deleted.status()).toBe(200);
  expect(await deleted.json()).toEqual({ deleted: true });
  expect(backend.objects.has(ownName)).toBe(false);
  expect(await (await request.get("/api/account")).json()).toMatchObject({ quota: { used: 1 } });

  const admin = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie(adminId)], origins: [] } });
  try {
    backend.storageError = 503;
    expect((await admin.delete(`/api/photos?name=${encodeURIComponent(otherName)}`)).status()).toBe(503);
    expect(backend.objects.has(otherName)).toBe(true);
    backend.storageError = null;
    expect((await admin.delete(`/api/photos?name=${encodeURIComponent(otherName)}`)).status()).toBe(200);
    expect(backend.objects.has(otherName)).toBe(false);
  } finally { await admin.dispose(); }
});

test("gallery confirms photo deletion and removes it after success", async ({ page, backend }) => {
  const name = `${userId}/gallery-delete.jpg`;
  await backend.db.query("insert into storage.objects(bucket_id, name) values ('photos', $1)", [name]);
  backend.objects.set(name, jpeg);

  await page.goto("/gallery");
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this photo?" });
  await expect(dialog).toContainText("does not restore your upload allowance");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete this photo?" }).getByRole("button", { name: "Delete photo" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this photo?" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  expect(backend.objects.has(name)).toBe(false);
});

test("gallery deletes only checked photos after confirmation", async ({ page, backend }) => {
  const names = [1, 2, 3].map((number) => `${userId}/selected-${number}.jpg`);
  for (const name of names) {
    await backend.db.query("insert into storage.objects(bucket_id, name) values ('photos', $1)", [name]);
    backend.objects.set(name, jpeg);
  }
  await page.goto("/gallery");
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Delete selected (0)", exact: true })).toBeDisabled();
  for (const name of names) await page.getByRole("checkbox", { name: `Select photo ${name}`, exact: true }).check();
  await page.getByRole("checkbox", { name: `Select photo ${names[2]}`, exact: true }).uncheck();
  await page.getByRole("button", { name: "Delete selected (2)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete 2 selected photos?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(backend.objects.size).toBe(3);
  await page.getByRole("button", { name: "Delete selected (2)", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete selected photos", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Delete selected (0)", exact: true })).toBeDisabled();
  expect([...backend.objects.keys()]).toEqual([names[2]]);
});

test("gallery reports partial deletion failures and retries remaining checked photos", async ({ page, backend }) => {
  const names = [1, 2].map((number) => `${userId}/retry-${number}.jpg`);
  for (const name of names) {
    await backend.db.query("insert into storage.objects(bucket_id, name) values ('photos', $1)", [name]);
    backend.objects.set(name, jpeg);
  }
  let fail = true;
  await page.route("**/api/photos?name=*", async (route) => {
    if (fail && new URL(route.request().url()).searchParams.get("name") === names[1]) {
      await route.fulfill({ status: 503, json: { error: "Could not delete photo. Please retry." } });
    } else await route.continue();
  });
  await page.goto("/gallery");
  for (const name of names) await page.getByRole("checkbox", { name: `Select photo ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Delete selected (2)", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete selected photos", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("1 of 2 photos could not be deleted");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel" })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  expect([...backend.objects.keys()]).toEqual([names[1]]);
  fail = false;
  await page.getByRole("button", { name: "Delete selected (1)", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete photo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(backend.objects.size).toBe(0);
});

test("database migration is rerunnable, preserves admin roles and denies direct Storage bypass", async ({ backend }) => {
  await backend.db.exec("insert into storage.objects(bucket_id, name) values ('backdrops', 'existing.jpg');");
  await backend.db.exec("insert into public.backdrop_settings(file_name, hidden, is_default) values ('existing.jpg', false, true);");
  await backend.db.exec(await readFile("supabase/setup.sql", "utf8"));
  const admin = await backend.db.query<{ role: string }>("select role from public.profiles where id = $1", [adminId]);
  expect(admin.rows[0].role).toBe("admin");
  const backdrops = await backend.db.query("select name from storage.objects where bucket_id = 'backdrops'");
  expect(backdrops.rows).toEqual([{ name: "existing.jpg" }]);
  const settings = await backend.db.query("select file_name, is_default from public.backdrop_settings");
  expect(settings.rows).toEqual([{ file_name: "existing.jpg", is_default: true }]);
  await backend.db.exec(`
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant insert, select on storage.objects to anon, authenticated;
    create policy test_old_permissive_policy on storage.objects for all to anon, authenticated using (true) with check (true);
  `);
  for (const role of ["anon", "authenticated"]) {
    await backend.db.exec(`set role ${role};`);
    await expect(backend.db.exec("insert into storage.objects(bucket_id, name) values ('photos', 'bypass.jpg');")).rejects.toThrow(/row-level security/);
    await expect(backend.db.exec("insert into storage.objects(bucket_id, name) values ('backdrops', 'bypass.jpg');")).rejects.toThrow(/row-level security/);
    await expect(backend.db.exec("select * from public.backdrop_settings;")).rejects.toThrow(/permission denied/);
    await expect(backend.db.exec("select public.set_backdrop_setting('existing.jpg', true, null);")).rejects.toThrow(/permission denied/);
    await backend.db.exec("reset role;");
  }
  await backend.db.exec("drop policy test_old_permissive_policy on storage.objects;");
});

test("backdrop upload is admin-only, validates images, and keeps shared reads private", async ({ page, request, playwright, backend }) => {
  const image = await readFile("public/images/photoboot-bg.jpeg");
  expect((await request.post("/api/backdrops?name=Clouds", { headers: { "Content-Type": "image/jpeg" }, data: image })).status()).toBe(403);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Manage backdrops" })).toHaveCount(0);
  await page.goto("/admin/backdrops");
  await expect(page).toHaveURL("/");
  const admin = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210", storageState: { cookies: [sessionCookie(adminId)], origins: [] } });
  try {
    expect((await admin.post("/api/backdrops", { headers: { "Content-Type": "image/svg+xml" }, data: "<svg/>" })).status()).toBe(415);
    expect((await admin.post("/api/backdrops", { headers: { "Content-Type": "image/jpeg" }, data: "not an image" })).status()).toBe(400);
    expect((await admin.post("/api/backdrops", { headers: { "Content-Type": "image/jpeg", Origin: "https://untrusted.test" }, data: image })).status()).toBe(403);
    expect((await admin.post("/api/backdrops", { headers: { "Content-Type": "image/jpeg" }, data: Buffer.alloc(4 * 1024 * 1024 + 1) })).status()).toBe(413);
    expect((await admin.post("/api/backdrops?name=Clouds", { headers: { "Content-Type": "image/jpeg" }, data: image })).status()).toBe(200);
    const listing = await request.get("/api/backdrops");
    expect(listing.headers()["cache-control"]).toBe("private, no-store");
    const { backdrops } = await listing.json();
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0].name).toBe("clouds");
    const download = await request.get(backdrops[0].url);
    expect(download.headers()["cache-control"]).toBe("private, no-store");
    expect(await download.body()).toEqual(image);
    expect((await request.get("/api/backdrops?file=../photos/private.jpg")).status()).toBe(400);
    expect((await request.get("/api/backdrops?manage=1")).status()).toBe(403);
    const manage = await admin.get("/api/backdrops?manage=1");
    expect(manage.headers()["cache-control"]).toBe("private, no-store");
    const managed = (await manage.json()).backdrops;
    expect(managed).toHaveLength(1);
    expect(managed[0]).toMatchObject({ name: "clouds", hidden: false, isDefault: false });
    expect((await request.patch("/api/backdrops", { data: { file: managed[0].file, hidden: true } })).status()).toBe(403);
    expect((await admin.patch("/api/backdrops", { data: { file: managed[0].file } })).status()).toBe(400);
    expect((await admin.patch("/api/backdrops", { data: { file: "../photos/private.jpg", hidden: true } })).status()).toBe(400);
    expect((await admin.patch("/api/backdrops", { headers: { Origin: "https://untrusted.test" }, data: { file: managed[0].file, hidden: true } })).status()).toBe(403);
    expect((await admin.patch("/api/backdrops", { data: { file: `${crypto.randomUUID()}_missing.jpg`, hidden: true } })).status()).toBe(404);
    expect((await admin.patch("/api/backdrops", { data: { file: managed[0].file, hidden: true, isDefault: true } })).status()).toBe(200);
    expect((await (await request.get("/api/backdrops")).json()).backdrops).toHaveLength(0);
    expect((await (await admin.get("/api/backdrops?manage=1")).json()).backdrops[0]).toMatchObject({ hidden: true, isDefault: true });
    expect((await admin.patch("/api/backdrops", { data: { file: managed[0].file, hidden: false } })).status()).toBe(200);
    expect((await (await request.get("/api/backdrops")).json()).backdrops[0]).toMatchObject({ name: "clouds", isDefault: true });
    expect((await admin.patch("/api/backdrops", { data: { file: managed[0].file, isDefault: false } })).status()).toBe(200);
    expect((await (await request.get("/api/backdrops")).json()).backdrops[0].isDefault).toBeUndefined();
    const quota = await admin.get("/api/account");
    expect((await quota.json()).quota.used).toBe(0);
    backend.storageError = 503;
    expect((await admin.post("/api/backdrops", { headers: { "Content-Type": "image/jpeg" }, data: image })).status()).toBe(503);
  } finally { await admin.dispose(); }
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
