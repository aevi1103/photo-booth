# Copilot Instructions

## Project shape

- This is a Next.js App Router photo booth. Server pages and route handlers live in `app/`; interactive camera and gallery experiences are client components in `components/`.
- The booth captures browser video into a WebGL canvas (`lib/compositor.ts`), compositing the camera, optional local green-screen backdrop, and frame into the JPEG that is reviewed and saved. The frame artwork and its opening coordinates are a matched pair; update both when changing the frame.
- `components/booth/hooks/use-booth-controller.ts` composes focused camera, preview, capture, and quota hooks around the vanilla Zustand store in `components/booth/store/store.ts`. Keep camera/device lifecycle in the hooks and booth UI state in the store; capture exports the same compositor canvas shown in preview.
- Backdrops are discovered from `public/images` by `app/page.tsx` and cached with Next.js `use cache`. They are bundled public assets, not private uploads.
- `proxy.ts` validates Supabase sessions for the booth, gallery, and API routes. OAuth/session cookie handling is in `app/auth/` and `lib/supabase/server.ts`; use `requireUser` for route-level user identity where needed.
- Photo writes and gallery listing go through server API routes using `lib/supabase/admin.ts`. Keep the service-role key server-only. `supabase/setup.sql` defines the private bucket, profiles/roles, upload reservations and quotas, listing functions, and restrictive Storage policy. It is designed to be rerunnable; preserve existing photos and role assignments when changing it.

## Build, test, and lint

Use Node.js 20.9 or later. Install dependencies with `npm install`.

- `npm run dev` — start the local app.
- `npm run lint` — run ESLint.
- `pnpm exec biome check <changed files>` — run Biome checks on changed files.
- `npm run build` — make a production build.
- `npm test` — run the Playwright suite.
- `npm test -- tests/auth.spec.ts` — run one test file.
- `npm test -- tests/auth.spec.ts -g "database migration is rerunnable"` — run one named test.

Playwright uses Chromium/Chrome, synthetic camera and microphone inputs, a local mocked Supabase HTTP service, and PGlite to execute the real `supabase/setup.sql`. For changes to auth, quotas, uploads, gallery access, or SQL, extend the corresponding tests in `tests/auth.spec.ts` or `tests/booth.spec.ts`.

## Project-specific constraints

- Read the relevant installed Next.js guide under `node_modules/next/dist/docs/` before changing Next.js APIs or conventions; this project uses Next.js 16.4.5. The generated guidance in `AGENTS.md` explains this constraint and should not be removed.
- Keep authorization and quota enforcement on the server/database, not only in booth UI state. Do not expose service-role credentials or enable direct client access to the private `photos` bucket.
- Keep uploads JPEG-only and enforce size/content checks on the server as well as in the browser. Preserve per-user reservation semantics so concurrent uploads cannot exceed the lifetime allowance.
- Signed gallery URLs are temporary; API responses containing user-specific data must remain private and non-cacheable.
- Camera access requires HTTPS or localhost. Automated camera tests use synthetic streams; device-specific camera behavior still needs browser/device validation.

For setup, Supabase configuration, deployment, and operator procedures, see [README.md](../README.md).
