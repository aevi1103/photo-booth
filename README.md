# Little Cloud Photo Booth

A browser-based baby-shower photo booth built with Next.js, shadcn/ui, and Supabase. It uses a Fujifilm X-T3 connected through an Elgato Cam Link as a browser camera, replaces a green screen locally, and lets guests review, download, or retake their pictures. Backgrounds are public; saved photos are private to administrators.

The app captures an HDMI **video frame**, not a full-resolution camera still. It does not trigger the camera shutter.

## What you need

- Node.js 20.9 or later, npm, and a current Chrome or Edge browser.
- An X-T3, micro-HDMI Type D to standard HDMI cable, Cam Link, compatible USB connection, green screen, and sustained camera power.
- A Supabase project and, for deployment, a GitHub repository and Railway project.
- Internet for background retrieval and saving photos. The live feed and chroma key run locally in the browser; this app does not provide an offline mode.

## Supabase setup

1. Create a Supabase project. In its SQL editor, run [supabase/setup.sql](supabase/setup.sql) **once**. It creates the background and administrator tables, storage buckets, policies, and shared upload limiter. Review policies before applying to an existing project. It is not a repeatable migration; policy creation will fail if run a second time.
2. In Authentication, create an administrator user. Limit who can create accounts in the Supabase Auth settings; a normal account is not an administrator by default.
3. In the SQL editor, add that user to the allowlist, substituting their actual user ID from the Supabase Auth dashboard:

   ```sql
   insert into public.booth_admins (user_id) values ('YOUR-AUTH-USER-UUID');
   ```

4. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`: project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable/anon key, safe to expose **only with the RLS policies installed**.
   - `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key. Never expose it in browser code or commit it.
   - `BOOTH_UPLOAD_CODE`: a long, unique, randomly generated secret used to authorize the booth's photo uploads. Never commit or share it publicly.

5. Run `npm install` and `npm run dev`, then open `http://localhost:3000/admin`. Sign in with the allowlisted account and upload JPEG, PNG, or WebP backgrounds, up to 8 MB each. Sign out of the admin screen before guests use the booth.
6. On the booth page, open **Booth setup** and enter the upload code. The code is kept only in the current page's memory, so enter it again after a refresh. A photo is saved automatically after capture; the review screen reports success or an error and offers retry. Download works even if online saving fails.

The booth code authorizes photo **uploads only**, not gallery access or deletion. It is not a substitute for individual guest identity: anyone who learns it can upload images. The server checks its content type, size, and JPEG signature and applies a shared 60-uploads-per-minute database limit after authentication. It does not fully decode or scan uploaded images, and invalid-code attempts are not rate limited by the app. Before exposing this publicly, configure edge rate limiting for `/api/photos`, use a high-entropy code, monitor usage, and rotate the code if exposed. Keep the service role key and upload code in server-side variables only.

Background images are publicly readable and must not contain sensitive information. Photos use a private bucket; administrators view them with one-hour signed URLs. Signed URLs are bearer links valid until expiry, including after administrator sign-out; do not share them. Photos remain until deleted by an administrator. The application stores no separate photo metadata beyond Supabase Storage object data.

## Camera setup and event run-through

1. Connect the X-T3's micro-HDMI port to the Cam Link's standard HDMI input, and connect the Cam Link to the computer. Choose a supported HDMI video mode, starting with 1080p.
2. In the X-T3's movie settings, turn off **HDMI OUTPUT INFO DISPLAY** for a clean feed. Verify the feed on the computer; disable automatic sleep and use suitable continuous power. See [Fujifilm's X-T3 movie settings](https://fujifilm-dsc.com/en/manual/x-t3/menu_shooting/movie_setting/index.html).
3. Open the booth over HTTPS or `localhost`, click **Connect**, grant camera permission, select the Cam Link from the camera list, and click **Connect** again. The displayed resolution is the actual negotiated video resolution.
4. Upload and choose a background, light the green screen evenly, and adjust key color, strength, and softness. Avoid green clothing, reduce shadows, and leave distance between the subject and screen.
5. Choose whether to mirror or add the frame, take a photo, and verify the review, download, and private upload. Test the complete setup for the intended event duration, including lighting, power, camera temperature, and network stability.

## Deploy to Railway

1. Push this project to an authorized GitHub repository and create a Railway project from that repository. Configure automatic deployments from your chosen branch.
2. Set the four environment variables listed above as Railway service variables. The two `NEXT_PUBLIC_` values are embedded into the browser bundle at **build time**; rebuilding is required after changing them. Do not mark service-role or booth-code values `NEXT_PUBLIC_`.
3. Railway can build using `npm run build` and start with `npm start`; Next.js reads Railway's `PORT`. Under service networking, generate a Railway-provided domain. Railway provides HTTPS, which is required for browser camera permissions.
4. Configure the Supabase Auth site URL and any redirect allowlist for the Railway HTTPS domain. Apply the Supabase SQL separately; Railway does not create Supabase resources.
5. Confirm the deployed URL, admin sign-in and sign-out, upload and selection of backgrounds, camera permissions and live chroma key, capture and download, online photo saving, administrator-only gallery access, and delete. Also check denied camera access and upload failure. Test from another browser/session that an unauthenticated user cannot list or delete photos.

Railway's service filesystem is not used for persistent photos. Monitor Railway and Supabase usage and costs. Do not assume a deployment has happened until it has been verified against the actual accounts and camera.

## Verification

Run `npm run lint`, `npm run build`, and `npm test`. The browser tests use the locally installed Google Chrome and synthetic camera data; they do not prove compatibility with the physical camera or validate live Supabase policies. Run the event checks above using real hardware and an isolated Supabase project.
