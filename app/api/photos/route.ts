import { timingSafeEqual, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 8 * 1024 * 1024;

function matchesCode(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const code = process.env.BOOTH_UPLOAD_CODE;
  if (!url || !secret || !code) return Response.json({ error: "Online photo saving is not configured." }, { status: 503 });
  if (!matchesCode(request.headers.get("x-booth-code") ?? "", code)) {
    return Response.json({ error: "The booth upload code is missing or incorrect." }, { status: 401 });
  }
  if (request.headers.get("content-type") !== "image/jpeg") {
    return Response.json({ error: "Only JPEG photos are accepted." }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_BYTES) return Response.json({ error: "Photo exceeds the 8 MB limit." }, { status: 413 });
  if (!request.body) return Response.json({ error: "No photo was provided." }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return Response.json({ error: "Photo exceeds the 8 MB limit." }, { status: 413 });
    }
    chunks.push(value);
  }
  const image = Buffer.concat(chunks);
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) {
    return Response.json({ error: "The photo is not a valid JPEG." }, { status: 400 });
  }
  const client = createClient(url, secret, { auth: { persistSession: false } });
  const { data: allowed, error: limitError } = await client.rpc("allow_photo_upload");
  if (limitError) {
    console.error("Photo upload rate limit failed:", limitError.message);
    return Response.json({ error: "Photo saving is temporarily unavailable." }, { status: 503 });
  }
  if (!allowed) return Response.json({ error: "Too many uploads. Please wait a minute and retry." }, { status: 429 });
  const { error } = await client.storage.from("photos").upload(`${randomUUID()}.jpg`, image, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("Photo upload failed:", error.message);
    return Response.json({ error: "Could not save photo. Please retry." }, { status: 503 });
  }
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
}
