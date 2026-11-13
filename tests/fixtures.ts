import { test as base, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

export const userId = "11111111-1111-4111-8111-111111111111";
export const otherId = "22222222-2222-4222-8222-222222222222";
export const adminId = "33333333-3333-4333-8333-333333333333";

export function sessionCookie(id = userId, expiresIn = 3600) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp, role: "authenticated", aud: "authenticated" })).toString("base64url")}.test-signature`;
  return {
    name: "sb-127-auth-token",
    value: "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_at: exp, expires_in: expiresIn, token_type: "bearer", user: { id } })).toString("base64url"),
    domain: "127.0.0.1", path: "/", expires: exp, httpOnly: true, secure: false, sameSite: "Lax" as const,
  };
}

type Backend = {
  db: PGlite;
  objects: Map<string, Buffer>;
  storageError: number | null;
  listError: boolean;
  signError: boolean;
};

export const test = base.extend<{ backend: Backend }, { supabase: Backend }>({
  supabase: [async ({}, use) => {
    const db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now());
    `);
    await db.exec(await readFile("supabase/setup.sql", "utf8"));
    const backend: Backend = { db, objects: new Map(), storageError: null, listError: false, signError: false };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1:9999");
        response.setHeader("Content-Type", "application/json");
        if (url.pathname === "/auth/v1/user") {
          const token = request.headers.authorization?.replace("Bearer ", "") ?? "";
          let id = "";
          try { id = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()).sub; }
          catch { /* Invalid tokens must be rejected by the mock auth service. */ }
          if (![userId, otherId, adminId].includes(id)) { response.statusCode = 401; response.end(JSON.stringify({ message: "Invalid token" })); return; }
          response.end(JSON.stringify({ id, aud: "authenticated", role: "authenticated", email: `${id.slice(0, 3)}@example.test`, app_metadata: { provider: "google" }, user_metadata: { role: "admin" }, created_at: "2026-01-01T00:00:00Z" }));
          return;
        }
        if (url.pathname === "/auth/v1/logout") { response.statusCode = 204; response.end(); return; }
        if (url.pathname === "/auth/v1/token") {
          const cookie = sessionCookie();
          const session = JSON.parse(Buffer.from(cookie.value.slice(7), "base64url").toString());
          response.end(JSON.stringify(session)); return;
        }
        if (request.headers.authorization !== "Bearer test-service-key") {
          response.statusCode = 403; response.end(JSON.stringify({ message: "Service key required" })); return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        const body = request.headers["content-type"]?.includes("application/json") ? JSON.parse(bytes.toString() || "{}") : {};
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          const name = url.pathname.split("/").pop();
          if (backend.listError && name === "list_booth_photos") {
            response.statusCode = 503; response.end(JSON.stringify({ message: "Test listing failure" })); return;
          }
          const functions: Record<string, { sql: string; args: unknown[] }> = {
            get_photo_quota: { sql: "select public.get_photo_quota($1) as value", args: [body.p_user_id] },
            reserve_photo_upload: { sql: "select public.reserve_photo_upload($1) as value", args: [body.p_user_id] },
            release_photo_upload: { sql: "select public.release_photo_upload($1) as value", args: [body.p_upload_id] },
            allow_photo_upload: { sql: "select public.allow_photo_upload() as value", args: [] },
            list_booth_photos: { sql: "select * from public.list_booth_photos($1, $2)", args: [body.p_user_id, body.p_offset] },
            get_backdrop_settings: { sql: "select * from public.get_backdrop_settings()", args: [] },
            set_backdrop_setting: { sql: "select public.set_backdrop_setting($1, $2, $3) as value", args: [body.p_file_name, body.p_hidden, body.p_is_default] },
          };
          const fn = functions[name ?? ""];
          if (!fn) throw new Error("Unexpected RPC");
          const result = await db.query<{ value: unknown }>(fn.sql, fn.args);
          response.end(JSON.stringify(["list_booth_photos", "get_backdrop_settings"].includes(name ?? "") ? result.rows : result.rows[0].value ?? null)); return;
        }
        if (url.pathname === "/rest/v1/photo_uploads" && request.method === "PATCH") {
          await db.query("update public.photo_uploads set status = $1 where id = $2", [body.status, url.searchParams.get("id")?.replace("eq.", "")]);
          response.statusCode = 204; response.end(); return;
        }
        if (url.pathname === "/storage/v1/object/list/backdrops") {
          if (backend.listError) {
            response.statusCode = 503; response.end(JSON.stringify({ message: "Test listing failure" })); return;
          }
          const result = await db.query("select id, name, created_at from storage.objects where bucket_id = 'backdrops' order by name limit $1 offset $2", [body.limit, body.offset]);
          response.end(JSON.stringify(result.rows)); return;
        }
        if (url.pathname.startsWith("/storage/v1/object/backdrops/")) {
          const path = decodeURIComponent(url.pathname.slice("/storage/v1/object/backdrops/".length));
          if (request.method === "GET") {
            const image = backend.objects.get(`backdrops/${path}`);
            if (!image) { response.statusCode = 404; response.end(JSON.stringify({ message: "Not found" })); return; }
            response.setHeader("Content-Type", path.endsWith(".png") ? "image/png" : "image/jpeg");
            response.end(image); return;
          }
          if (backend.storageError) {
            response.statusCode = backend.storageError; response.end(JSON.stringify({ statusCode: String(backend.storageError), message: "Test upload failure" })); return;
          }
          backend.objects.set(`backdrops/${path}`, bytes);
          await db.query("insert into storage.objects(bucket_id, name) values ('backdrops', $1)", [path]);
          response.end(JSON.stringify({ Key: `backdrops/${path}` })); return;
        }
        if (url.pathname.startsWith("/storage/v1/object/photos/")) {
          if (backend.storageError) {
            response.statusCode = backend.storageError;
            response.end(JSON.stringify({ statusCode: String(backend.storageError), message: "Test upload failure", error: "UploadFailed" })); return;
          }
          const path = decodeURIComponent(url.pathname.slice("/storage/v1/object/photos/".length));
          backend.objects.set(path, bytes);
          await db.query("insert into storage.objects(bucket_id, name) values ('photos', $1)", [path]);
          response.end(JSON.stringify({ Key: `photos/${path}` })); return;
        }
        if (url.pathname === "/storage/v1/object/sign/photos") {
          response.end(JSON.stringify(body.paths.map((path: string) => backend.signError
            ? { path, error: "Cannot sign", signedURL: null }
            : { path, signedURL: `/object/sign/photos/${path}?token=test-token` }))); return;
        }
        if (url.pathname === "/storage/v1/object/photos" && request.method === "DELETE") {
          if (backend.storageError) {
            response.statusCode = backend.storageError;
            response.end(JSON.stringify({ statusCode: String(backend.storageError), message: "Test deletion failure" })); return;
          }
          for (const path of body.prefixes as string[]) {
            backend.objects.delete(path);
            await db.query("delete from storage.objects where bucket_id = 'photos' and name = $1", [path]);
          }
          response.end(JSON.stringify([])); return;
        }
        response.statusCode = 404; response.end(JSON.stringify({ message: "Unexpected test request" }));
      } catch (error) {
        console.error("Mock Supabase failed:", error);
        response.statusCode = 500; response.end(JSON.stringify({ message: "Mock Supabase failure" }));
      }
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(9999, "127.0.0.1", resolve); });
    await use(backend);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }, { scope: "worker" }],
  backend: async ({ supabase }, runFixture) => {
    await supabase.db.exec(`
      truncate public.photo_uploads, public.photo_upload_limits, public.backdrop_settings, storage.objects;
      delete from auth.users;
      insert into auth.users(id) values ('${userId}'), ('${otherId}'), ('${adminId}');
      update public.profiles set role = 'admin' where id = '${adminId}';
    `);
    supabase.objects.clear();
    supabase.storageError = null;
    supabase.listError = false;
    supabase.signError = false;
    await runFixture(supabase);
  },
  storageState: async ({ backend }, runFixture) => {
    void backend;
    await runFixture({ cookies: [sessionCookie()], origins: [] });
  },
});

export { expect };
