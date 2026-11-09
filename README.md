# Little Cloud Photo Booth

A Next.js baby-shower booth. The live camera is placed inside the supplied decorative frame; the reviewed, downloaded, and uploaded JPEG includes that same frame. Optionally replace a green screen with a local backdrop. Camera processing happens in the browser, and photos can be saved privately to Supabase.

The app captures an HDMI **video frame**, not a full-resolution camera still. It does not trigger the camera shutter. The frame uses the aspect ratio of the provided artwork; the camera feed is center-cropped to fill its opening.

## Run and test locally

Install Node.js 20.9 or later and run:

```shell
npm install
npm run dev
```

Configure Supabase authentication and storage using the steps below, then open `http://localhost:3000` in Chrome or Edge and sign in with Google. Click **Connect** and allow camera access. Choose the Cam Link from the dropdown and click **Connect** again. The frame appears around the camera feed without needing a green screen. Captures upload automatically; download is available as a fallback if saving fails.

For hands-free capture, click **Enable voice capture**, allow microphone access, and say **“capture”** to start the three-second countdown. Voice control is off by default and continues listening until stopped or the page closes. It ignores commands while the countdown or photo review is active; use **Retake** before the next command. Browser speech-recognition support varies, may require internet, and may send microphone audio to a browser-provided speech service. If unavailable, use **Take a photo** instead.

If voice recognition reports a network error, it could not reach the browser's speech service; this does not necessarily mean your microphone is broken. If using VS Code's integrated browser, open the booth URL in standalone Google Chrome instead. Otherwise check your connection and whether a VPN, firewall, or browser policy blocks the speech service. The app retries briefly and then shows an error; you can enable it again or take a photo manually. This feature does not use Supabase.

The provided frame is [baby-shower.png](public/frames/baby-shower.png). The supplied reference had an opaque checkerboard, so it was converted to transparency for the camera opening. Its artwork and camera-opening coordinates are designed as a pair; replacing this file with a different layout also requires adjusting the compositor coordinates.

To replace a green screen within the frame, turn on **Replace green screen** and select a backdrop. JPEG, PNG, and WebP files in [public/images](public/images) become available in the picker. Add files before starting the server or rebuilding/redeploying the app; the list is cached and bundled as part of the application. Images in `public` are publicly accessible when deployed, so do not include sensitive images. Adjust the green-screen settings for your lighting; avoid green clothing and shadows.

## Google sign-in, roles, and Supabase photos

Google sign-in is required before opening the booth or gallery. Supabase stores private JPEGs; backgrounds and the frame remain bundled locally. **Booth upload codes are no longer used** and `BOOTH_UPLOAD_CODE` can be removed from local/Railway variables.

1. Run **all of** [supabase/setup.sql](supabase/setup.sql) in the Supabase SQL editor, including when upgrading an existing booth. It is rerunnable, preserves photos and existing role assignments, creates user profiles and upload reservations, and keeps the `photos` bucket private. A restrictive Storage policy blocks direct client access to this bucket even if older permissive policies exist; all booth photo access goes through the server.
2. Copy [.env.example](.env.example) to `.env.local` (or update your existing ignored environment file), then set:
   - `SUPABASE_URL`: the project URL.
   - `SUPABASE_PUBLISHABLE_KEY`: the publishable key from **Project Settings → API Keys** (legacy anon keys also work). Existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` variables are accepted too.
   - `SUPABASE_SERVICE_ROLE_KEY`: the server secret/service-role key, never a publishable key.
   - `APP_URL`: `http://localhost:3000` locally, or your exact Railway HTTPS origin in production. This pins OAuth callbacks and same-origin upload/sign-out checks to your public app address.
   The prior `NEXT_PUBLIC_SUPABASE_URL` is accepted if `SUPABASE_URL` is unset. Restart after changing variables. Never commit secrets or expose the service-role key to the browser.
3. In **Supabase → Authentication → Sign In / Providers**, enable Google. In **URL Configuration**, set the Site URL to your deployed app origin and add exact redirect URLs `http://localhost:3000/auth/callback` and `https://YOUR-RAILWAY-DOMAIN/auth/callback`. Google Cloud's authorized OAuth redirect URI is the Supabase provider callback (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`), not the app callback.
4. Open the app and choose **Continue with Google**. Sessions use server-managed HttpOnly cookies and are verified with Supabase before protected pages and API calls. **Sign out** ends this browser's session. Ordinary users see their remaining uploads and only their own gallery; admins see all event photos.
5. Captures upload automatically, including the frame, into `photos/<user-id>/<random-id>.jpg`. Saving disables Retake until it completes. On failure, review shows **Download photo** as a fallback and **Retry saving**. The gallery lists newest photos first in batches of 24. Click a photo to open it full-size. Signed links expire after 15 minutes; **Refresh photos** renews them. Signing out cannot revoke links already opened or shared before expiry.

### Assign an admin

Sign in once to create the account, then use **Table Editor → profiles** to change that account's `role` from `user` to `admin`. Match `profiles.id` to the account UUID in **Authentication → Users**. Or run this in the SQL editor, replacing the example address:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'host@example.com');
```

Set `role = 'user'` to revoke admin access. Users cannot edit roles through the app or Supabase client, and role claims in Google/user metadata are ignored. Role changes are read from the database, not cached in OAuth tokens. The booth refreshes the allowance on browser focus; reload to update immediately.

### Upload allowance and recovery

Non-admins have a **lifetime total of 20 uploads per account**, not 20 per session/day. Admins have no total cap. Reserved/in-progress uploads count toward the limit, and PostgreSQL serializes reservations per user so concurrent requests and multiple tabs cannot exceed it. Upload allowance is checked server-side; editing the UI cannot bypass it. At zero, manual and voice capture are disabled, but gallery access remains available. Deleting a stored image does not reset a user's lifetime allowance.

Definite Storage rejections release an unused reservation. Ambiguous network/server failures retain it conservatively because the object may have been stored. For an interrupted upload, a trusted operator can compare `public.photo_uploads` rows with Storage and release a **known finished, failed request with no object** using `select public.release_photo_upload('UPLOAD-UUID');` in the SQL editor. Do not release slots while requests may still be running. Do not delete uploaded reservation records to bypass normal accounting.

Photos from the older code-based booth have no trustworthy user ownership. They remain intact and visible to admins only; they are not assigned to Google accounts automatically or counted toward a user's new allowance. Manage/delete photos through **Storage → photos** in the Supabase dashboard.

The server validates upload type, size and JPEG signature and retains a shared 60-uploads-per-minute throughput limiter (including for admins). It does not decode or scan uploaded images. Before public deployment configure edge rate limiting for authentication and `/api/` endpoints, monitor usage, and clearly tell guests about photo storage. Any Google account allowed by your Supabase/Google provider can sign in; the 20-photo limit is per account, not an event invitation system.

## Camera setup

### Phones and tablets

On narrow screens the photo booth appears first. Settings are collapsed below it; tap **Show settings** to choose/connect a camera or adjust the backdrop, then **Hide settings** to keep them out of the way. Hiding settings preserves your selections and leaves the camera running. Desktop settings remain visible beside the booth.

Open the deployed **HTTPS** URL directly in Safari on iPhone/iPad or Chrome on Android, allow camera permission, choose **Front camera (selfie)** or **Rear camera**, and press **Connect**. Use **Retake** before switching cameras after a capture. The preview stays inline and uses the same frame and JPEG upload flow as desktop. Portrait video is center-cropped into the artwork's fixed opening; turning the phone sideways can give more room for groups. If the camera pauses after switching apps, return and press **Connect** again. Permission errors include recovery instructions.

Opening a development server through a phone using plain HTTP and a computer's LAN IP does **not** provide the secure context camera access requires; use the Railway HTTPS URL or a trusted HTTPS development setup. Mobile built-in cameras are the supported baseline. Connecting the Fuji/Cam Link directly to a phone or tablet is not guaranteed: USB host support, power, adapters, OS, and browser must expose it as a camera. If it is available it appears in the camera list after permission; otherwise use the phone camera or connect Cam Link to a computer. Voice recognition support is separate from camera support.

Automated mobile-viewport tests use synthetic camera streams; actual iOS/Android camera permissions, hardware, and external Cam Link compatibility still require on-device testing before the event.

Connect the Fujifilm X-T3's micro-HDMI port to the Elgato Cam Link, then connect the Cam Link to the computer. Choose a compatible output mode, starting with 1080p, and turn off **HDMI OUTPUT INFO DISPLAY** in the camera's movie settings. Close other camera applications if they hold the Cam Link. Provide sustained power, prevent sleep, and test camera temperature and stability for the whole event. The browser requires HTTPS or localhost for camera access.

## Deploy on Railway

Connect a GitHub repository to Railway for automatic deployment. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_URL` as server environment variables. Railway builds with `npm run build`, starts with `npm start`, and supplies the port. Generate a Railway HTTPS domain, set `APP_URL` to that HTTPS origin, add its `/auth/callback` URL to the Supabase redirect allowlist, and apply the SQL setup separately. Adding or changing bundled backdrops requires a rebuild and redeployment. Verify Google sign-in, sign-out, roles, remaining allowance, camera access, framing, download, cloud save and the private bucket using the actual event hardware and Supabase project. Hosting and storage may incur charges.

## Verification

Run `npm run lint`, `npm run build`, and `npm test`. Tests use simulated camera streams, a local mocked Supabase Auth/Storage HTTP service and an in-memory PostgreSQL engine (PGlite) that executes the actual setup SQL. Coverage includes OAuth cookies, session refresh, protected routes, role privilege restrictions, direct Storage bypass prevention, gallery ownership, concurrent 20-upload enforcement, admin exemption, and the remaining-allowance UI. Real Google OAuth credentials, device hardware and the live Supabase migration must still be verified separately; automated tests do not alter your live project.
