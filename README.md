# Little Cloud Photo Booth

A Next.js photo booth for a baby shower. It places the live camera preview inside a decorative frame and saves the reviewed image, including the frame, as a private JPEG in Supabase Storage. An optional green-screen effect can replace the background with an image bundled with the app.

> **Camera note:** The booth uses react-webcam for the browser's video stream. It does not trigger a camera's still-photo shutter or capture a full-resolution camera still. The camera feed is center-cropped to fill the frame's transparent photo opening without stretching. The composited preview, including the artwork and effects, is exported as the JPEG rather than a raw webcam screenshot.

## Set up and run locally

You will need Node.js 20.9 or later, a Supabase project, and a Google OAuth client. Camera access requires `localhost` or HTTPS; Chrome or Edge are recommended for setup.

### 1. Set up Supabase

In the Supabase SQL Editor, run **all** of [`supabase/setup.sql`](supabase/setup.sql). Run it for new installs and upgrades. It is rerunnable, preserves photos and existing role assignments, creates the user profiles and upload reservations, and keeps the `photos` bucket private. The restrictive Storage policy prevents direct client access; photo uploads and gallery access go through the app server.

### 2. Enable Google sign-in

In **Supabase → Authentication → Sign In / Providers**, enable Google and configure its OAuth credentials.

In **Authentication → URL Configuration**:

- Set the Site URL to your app's origin (locally, `http://localhost:3000`).
- Add the exact redirect URL `http://localhost:3000/auth/callback`. Add your production callback after deployment: `https://YOUR-APP.vercel.app/auth/callback`.

In Google Cloud, the authorized redirect URI is the Supabase provider callback, `https://YOUR-PROJECT.supabase.co/auth/v1/callback`—not the app's `/auth/callback` URL.

### 3. Configure local environment

Copy the example file and add your Supabase project values:

```shell
cp .env.example .env.local
```

Set these values in `.env.local`:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | The publishable key from **Project Settings → API Keys**. Legacy anon keys also work. |
| `SUPABASE_SERVICE_ROLE_KEY` | The server secret/service-role key. Keep it private; never expose it to the browser. |
| `APP_URL` | `http://localhost:3000` for local development. In production, use the app's exact HTTPS origin. |

For existing deployments, `NEXT_PUBLIC_SUPABASE_URL` is accepted if `SUPABASE_URL` is unset. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also accepted. Restart the dev server after changing environment variables. Never commit `.env.local` or expose the service-role key.

### 4. Install and start the app

From the repository root:

```shell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose **Continue with Google**, and sign in. Allow camera access, choose a camera, then press **Connect**. If using a Cam Link, choose it from the camera list and press **Connect** again.

To install the booth, use your browser's install or add-to-home-screen option. On iPhone or iPad, use Safari's **Share → Add to Home Screen**. Installation requires HTTPS (or localhost); the installed app still needs an internet connection and Google sign-in. Offline access and push notifications are not supported.

### 5. Take and save a photo

Choose **Take a photo** or enable voice capture and say **“capture”**. One trigger shoots every photo opening in the frame in turn (three for the default frame): the next opening shows the live camera with a five-second countdown and a “Photo N of 3” label, each shot freezes in its opening, and the booth pauses briefly before moving on. The other openings stay empty until their turn. After the last shot, review the combined picture and choose **Retake** to reshoot every opening or **Save photo** to upload one framed JPEG, which uses one upload slot. Once saving succeeds, the live camera returns and the gallery refreshes with the newest photo first. The camera is mirrored by default in both the preview and saved photo; previously saved mirror preferences are preserved. Wait for the save confirmation; the shutter sound means a shot was taken, not that anything was uploaded. A camera interruption mid-sequence discards the shots taken so far.

While saving, another capture is blocked. If saving fails, the image stays available with **Retry saving**, **Download photo**, and **Discard photo**. Discard explicitly gives up that unsaved image and returns to the camera. Open **Menu → View gallery** for the standalone gallery and printing.

## Using the booth

The booth uses the full page width. On large screens, the camera sits beside a narrow, frosted semi-transparent gallery with one thumbnail column and independent vertical scrolling for the available viewport height. On smaller screens the gallery becomes a swipeable carousel below the booth. Hover over or keyboard-focus a sidebar thumbnail to see its upload time in a tooltip. Use the circular-arrow refresh icon to reload photos. The sidebar has no deletion controls; admins can manage deletion on the standalone gallery page. Click a thumbnail to view the whole photo in a dialog; use Close or Escape to return. Choose **Hide gallery** beside **Menu** in the top toolbar to give the booth the full width, or **Show gallery** to bring it back without interrupting the camera. On small screens these two controls use icons to save space. The gallery starts visible on each page load. The **Menu** button opens the standalone gallery, **Sign out**, or **Manage backdrops** (admins only). Camera controls and status sit above the frame. Photo mode hides the gallery and keeps the camera full-screen through captures. Upload-limit warnings and recovery actions remain visible when needed.

### Voice capture and sounds

Voice capture is off by default. Choose the microphone icon (**Enable voice capture**) and allow microphone access to use it. It keeps listening until stopped or the page closes, and ignores commands during a capture sequence, while a photo is under review, while saving, or while an unsaved photo needs recovery. After a successful save, say **“capture”** again for the next photo. Speech recognition support varies by browser, may require internet, and may send microphone audio to a browser-provided speech service. It does not use Supabase. If it is unavailable, use manual capture.

The listening status and latest recognized words appear below the controls. The booth reacts as soon as it hears the word **capture**, without waiting for a finalized transcript; updates to the same spoken command do not trigger another photo. If no words appear, check Chrome's selected microphone and site microphone permission. If words appear but no countdown starts, make sure the camera is ready, uploads are still available, and no photo is under review.

Manual and voice capture play five countdown beeps and a shutter sound for each opening. Sounds are generated locally in the browser. **Connect** and **Enable voice capture** unlock playback on devices with autoplay restrictions. If sound is blocked, capture and saving still work.

If voice recognition reports a network error, it could not reach the browser's speech service; this does not necessarily mean the microphone is broken. Try standalone Chrome instead of VS Code's integrated browser, check the network, and retry voice capture. A VPN, firewall, or browser policy may block the service.

### Backdrops

Backdrops are frame overlays. Portrait, landscape, and square designs retain their original aspect ratio in the preview, and saved JPEGs use the frame image's original pixel dimensions. Photo mode shows the entire frame with empty space where necessary, rather than stretching or cropping the artwork.

A design can have up to three transparent photo openings. The booth detects each opening that is at least a fifth the area of the largest one, shoots them left to right (or top to bottom when they are stacked), and center-crops the camera to fill each one; the original transparency preserves irregular edges and decorations over the photos. Small decorative holes and transparent outer borders are not treated as openings. A fully transparent image uses the whole image for the camera; an opaque image covers it entirely. Very large frames may exceed a device's graphics limits or the existing JPEG upload-size limit; native-size output does not add detail to the camera video.

Admins can open **Manage backdrops** from the booth (`/admin/backdrops`) and upload PNG or WebP designs with a transparent window (JPEG is accepted but has no transparency, so it covers the video entirely) up to 4 MiB. Run the updated [`supabase/setup.sql`](supabase/setup.sql) first to create the private `backdrops` bucket and the backdrop curation settings. Uploads do not consume photo allowances. Only admins can access the management page, upload API, or curation API; all signed-in guests can use visible uploaded backdrops.

The booth uses one shared frame with no guest frame picker. On the management page, admins can hide uploaded backdrops and mark one visible design as the **booth default**. Without an admin default, the first bundled design from [`public/frames`](public/frames) is used. Old personal frame selections are ignored. No green screen is needed to use backdrops. Separately, a saved green-screen preference can key out green areas of the camera; the booth shows a hint when that is on but the camera cannot see the key color.

Uploaded images are served through the authenticated app API and require no redeployment. Bundled defaults are cached and require a rebuild/redeployment to change; files in `public` are publicly accessible, so do not put sensitive images there.

### Gallery and access

Google sign-in is required for the booth and gallery. Ordinary users see their own photos; admins can see all event photos. The gallery shows newest photos first in pages of 24. Delete and bulk-selection controls are visible only to admins on the standalone `/gallery` page, never in the booth sidebar; existing server-side owner/admin access checks remain unchanged. Signed image links expire after 15 minutes; choose **Refresh photos** to renew them. Signing out cannot revoke links that have already been opened or shared.

Choose the printer icon below a photo, or open a photo from either gallery and choose **Print** beside **Share** above the image. The preview dialog blurs the background. Printing opens your browser's print dialog to select a local printer. Only the image is printed, sized to fit the page without cropping. If the photo is unavailable, refresh the gallery before printing. Printer settings and non-printable margins may affect the final output.

Admins can choose **Delete** on a photo, or check multiple photos and choose **Delete selected**, then confirm. Only selected photos currently loaded in the gallery are included. The API continues to enforce owner/admin authorization, but ordinary users are not shown deletion controls. Deletion is permanent and does not restore the lifetime upload allowance. If some deletions fail, the gallery refreshes to show what remains so you can retry.

### Share a photo

Open a thumbnail, then choose **Share** above the full-size image. Supported mobile Safari/Chrome browsers open the system share sheet with the actual image file. Cancelling does nothing. If the browser blocks sharing after a slow image download, close the popover and tap Share again; the prepared image is reused. Where file sharing is unavailable, the popover offers Facebook, X, WhatsApp, **Copy link** (with a Copied toast), and **Download image**.

Facebook and X share a public page, not an uploaded file. Only photos already authorized for the current gallery receive signed, unguessable links. Anyone with a link can view that photo without signing in for **seven days from link creation**. The private bucket stays private; the server validates the signed token before reading the image. Links and image responses are not persistently cached by the app. Deleting the original makes future requests fail, but cannot revoke downloads, screenshots, or social-platform caches. Refreshing the gallery creates fresh links. Rotating the server secret invalidates existing share links. These public links are excluded from search indexing, but are not confidential once shared.

The reusable component accepts an image URL, a **public absolute page URL**, and a title:

```tsx
import { ShareButton } from "@/features/share/ShareButton";

{photo.shareUrl && (
  <ShareButton
    imageUrl={`${photo.shareUrl}/image`}
    pageUrl={photo.shareUrl}
    title="Nugget Photo Booth memory"
  />
)}
```

`shareImage(imageUrl, pageUrl, title)` in [`features/share/shareImage.ts`](features/share/shareImage.ts) is also reusable. Call it from a user click; it returns `shared`, `cancelled`, or `unsupported` and throws other failures for the caller to display.

No paid APIs, new API keys, Facebook app review, or social SDKs are needed. Existing hosting/Storage bandwidth limits still apply. Set `APP_URL` to the real **HTTPS** origin in production so Open Graph/Twitter metadata points to publicly reachable absolute URLs. The OG image uses the original photo without cropping rather than forcing it into 1200x630.

For testing, use localhost or a trusted HTTPS tunnel; plain HTTP on a LAN address does not enable the Web Share API or clipboard. A social crawler cannot reach localhost: use the public HTTPS deployment/tunnel, ensure anonymous access to both `/share/[id]` and `/share/[id]/image`, and check the large-image preview. Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) can refresh its OG cache. Test native sharing and cancellation on actual iOS Safari and Android Chrome; desktop Playwright coverage mocks the native API and checks the fallback and public metadata.

## Roles, upload limits, and recovery

### Make an account an admin

Sign in once to create the account. In **Supabase → Table Editor → profiles**, change that account's `role` from `user` to `admin`; match `profiles.id` to the account UUID in **Authentication → Users**. Or run this in the SQL Editor, replacing the example email:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'host@example.com');
```

Set `role` back to `user` to revoke admin access. Users cannot edit roles through the app or Supabase client, and role claims in Google/user metadata are ignored. Role changes are read from the database, not cached in OAuth tokens. The booth refreshes the allowance when the browser regains focus; reload to update immediately.

### Understand upload allowances

Each non-admin account can save **20 photos total for the lifetime of the account**; admins have no total cap. Reserved and in-progress uploads count toward the limit. The database serializes reservations so concurrent uploads across requests and tabs cannot exceed it. The limit is enforced server-side, and deleting an image does not restore an upload.

At zero, manual and voice capture are disabled, but gallery access remains available. Definite Storage rejections release an unused reservation. An ambiguous network/server failure keeps its reservation because the photo may have been stored.

For an interrupted upload, a trusted operator can compare `public.photo_uploads` with Storage. Release a reservation only after confirming the request has finished and no object exists:

```sql
select public.release_photo_upload('UPLOAD-UUID');
```

Do not release reservations for requests that may still be running or delete uploaded reservation records to bypass normal accounting.

Photos from the older code-based booth have no trustworthy user ownership. They remain intact, visible to admins only, and are not automatically assigned to Google accounts or counted toward the new allowance. Manage or delete them through **Supabase → Storage → photos**.

Photo uploads are limited to JPEGs up to 4 MiB and checked on the server for size and JPEG signature. A shared server-side limiter allows 60 photo/backdrop upload attempts per minute, including for admins. Images are not decoded or scanned on the server. Any Google account allowed by the configured Supabase/Google provider can sign in; the allowance is per account, not an event invitation system. Before public deployment, configure edge rate limiting for authentication and `/api/` endpoints, monitor usage, and tell guests how their photos are stored.

## Camera setup

Camera access requires HTTPS or `localhost`. A development server opened on a phone over a computer's plain-HTTP LAN address will not provide a secure context; use the deployed HTTPS URL or a trusted HTTPS development setup.

### Phones and tablets

Open the deployed HTTPS URL directly in Safari on iPhone/iPad or Chrome on Android, allow camera access, choose **Front camera (selfie)** or **Rear camera**, and press **Connect**. On narrow screens, settings are collapsed below the booth; **Show settings** and **Hide settings** preserve selections and do not stop the camera. Use **Retake** before switching cameras after a capture. If the camera pauses after switching apps, return and press **Connect** again.

Mobile built-in cameras are the supported baseline. Using a Fuji/Cam Link directly with a phone or tablet is not guaranteed; it depends on USB host support, power, adapters, OS, and browser. If the device exposes it as a camera, it appears in the camera list. Otherwise use the phone's camera or connect the Cam Link to a computer. Voice recognition support is separate from camera support.

### Fujifilm X-T3 and Cam Link

Connect the camera's micro-HDMI port to the Elgato Cam Link, then connect the Cam Link to the computer. Start with a compatible 1080p output mode and turn off **HDMI OUTPUT INFO DISPLAY** in the camera's movie settings. Close other camera applications that may hold the Cam Link. Provide sustained power, prevent sleep, and test camera temperature and stability for the whole event.

Automated mobile-viewport tests use synthetic camera streams. Test actual iOS/Android camera permissions, hardware, and external Cam Link compatibility on the target devices before the event.

## Deploy to Vercel

1. Import the GitHub repository in Vercel, choose the **Next.js** preset, and use the repository root and default install/build commands (`npm install`, `npm run build`). No custom start command, Dockerfile, or `vercel.json` is needed.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_URL` in **Settings → Environment Variables**. Set `APP_URL` to the exact production HTTPS origin, such as `https://YOUR-APP.vercel.app`. Keep the service-role key server-only.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to that production origin and add `https://YOUR-APP.vercel.app/auth/callback` to Redirect URLs. Keep `http://localhost:3000/auth/callback` for local development. Google Cloud continues to use the Supabase provider callback, not a Vercel callback.
4. Run [`supabase/setup.sql`](supabase/setup.sql) if it has not already been applied, then deploy. Existing photos, admin roles, and allowances remain in the same Supabase project. Git pushes deploy automatically.
5. Test Google sign-in/sign-out, allowances, gallery, camera, and photo saving on the deployed HTTPS URL before an event or before shutting down another host.

Vercel Functions have a [4.5 MB request limit](https://vercel.com/docs/functions/limitations#request-body-size), so the app accepts JPEGs up to **4 MiB (4,194,304 bytes)**. The browser and server both enforce this limit. Larger captures offer a download fallback without sending an oversized request or consuming an upload slot. The private Supabase bucket may retain its 8 MiB limit; the app enforces the lower limit, so no database change is needed.

For Preview deployments, use that deployment's exact HTTPS origin as `APP_URL` and explicitly allowlist its callback in Supabase. Do not reuse the production `APP_URL` on a different preview domain or broadly wildcard untrusted preview URLs. Redeploy after changing environment variables. Frame and bundled-default backdrop changes require a new deployment; runtime photo and admin backdrop uploads go to Supabase, not Vercel's filesystem.

Check [Vercel pricing](https://vercel.com/pricing) and usage before the event. Free hosting is not unlimited, and Supabase has its own storage and usage limits.

## Development and tests

```shell
npm run dev       # Start the local app
npm run lint      # Run ESLint
npm run build     # Create a production build
npm test          # Run the Playwright suite
```

Run a specific test file or a named test:

```shell
npm test -- tests/auth.spec.ts
npm test -- tests/auth.spec.ts -g "database migration is rerunnable"
```

Playwright uses Chrome/Chromium with synthetic camera and microphone inputs, a local mocked Supabase Auth/Storage service, and PGlite to execute the real `supabase/setup.sql`. Coverage includes OAuth cookies, session refresh, protected routes, role restrictions, Storage access, gallery ownership, concurrent upload limits, and booth capture. Tests do not alter your live Supabase project. Real Google OAuth credentials and device-specific camera behavior require separate verification.
