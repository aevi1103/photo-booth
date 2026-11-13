import { appOrigin } from "@/lib/app-origin";
import { requireUser } from "@/lib/auth";
import { MAX_PHOTO_BYTES, PHOTO_SIZE_ERROR } from "@/lib/photo-limits";
import { isPhotoQuota, isPhotoReservation } from "@/lib/photo-quota";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const headers = { "Cache-Control": "private, no-store" };
  const rawOffset = new URL(request.url).searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 2147483622) {
    return Response.json({ error: "Invalid photo page." }, { status: 400, headers });
  }
  const client = createAdminClient();
  const bucket = client.storage.from("photos");
  const { data, error } = await client.rpc("list_booth_photos", { p_user_id: auth.user.id, p_offset: offset });
  if (error || !Array.isArray(data) || !data.every((file: unknown) => file && typeof file === "object" && "name" in file && typeof file.name === "string" && "created_at" in file && typeof file.created_at === "string")) {
    console.error("Photo listing failed:", error?.message ?? "Invalid photo list.");
    return Response.json({ error: "Could not load photos. Please retry." }, { status: 503, headers });
  }
  const files: { name: string; created_at: string }[] = data;
  const images = files.slice(0, 24);
  if (!images.length) {
    return Response.json({ photos: [], nextOffset: files.length > 24 ? offset + 24 : null }, { headers });
  }
  const { data: signed, error: signingError } = await bucket.createSignedUrls(images.map((file) => file.name), 900);
  if (signingError || !signed || signed.length !== images.length || signed.some((photo) => photo.error || !photo.signedUrl)) {
    console.error("Photo URL signing failed:", signingError?.message ?? "Missing signed photo URL.");
    return Response.json({ error: "Could not open photos. Please retry." }, { status: 503, headers });
  }
  return Response.json({
    photos: images.map((file, index) => ({ name: file.name, createdAt: file.created_at, url: signed[index].signedUrl })),
    nextOffset: files.length > 24 ? offset + 24 : null,
  }, { headers });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin(request)) {
    return Response.json({ error: "Invalid upload origin." }, { status: 403 });
  }
  if (request.headers.get("content-type") !== "image/jpeg") {
    return Response.json({ error: "Only JPEG photos are accepted." }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_PHOTO_BYTES) return Response.json({ error: PHOTO_SIZE_ERROR }, { status: 413 });
  if (!request.body) return Response.json({ error: "No photo was provided." }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return Response.json({ error: PHOTO_SIZE_ERROR }, { status: 413 });
    }
    chunks.push(value);
  }
  const image = Buffer.concat(chunks);
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) {
    return Response.json({ error: "The photo is not a valid JPEG." }, { status: 400 });
  }
  const client = createAdminClient();
  const { data: allowed, error: limitError } = await client.rpc("allow_photo_upload");
  if (limitError) {
    console.error("Photo upload rate limit failed:", limitError.message);
    return Response.json({ error: "Photo saving is temporarily unavailable." }, { status: 503 });
  }
  if (!allowed) return Response.json({ error: "Too many uploads. Please wait a minute and retry." }, { status: 429 });
  const { data: reservation, error: quotaError } = await client.rpc("reserve_photo_upload", { p_user_id: auth.user.id });
  if (quotaError || !isPhotoReservation(reservation)) {
    console.error("Photo quota reservation failed:", quotaError?.message ?? "Invalid quota reservation.");
    return Response.json({ error: "Could not check your upload allowance. Please retry." }, { status: 503 });
  }
  if (!reservation.allowed) return Response.json({ error: "You have reached your total limit of 20 photos.", quota: reservation.quota }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (!reservation.path.startsWith(`${auth.user.id}/`)) {
    console.error("Invalid reserved photo path.");
    return Response.json({ error: "Could not prepare your photo upload." }, { status: 503 });
  }
  const { error } = await client.storage.from("photos").upload(reservation.path, image, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("Photo upload failed:", error.message);
    // Keep an uncertain upload reserved: a network error may still have stored it.
    if ("statusCode" in error && Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
      const { error: releaseError } = await client.rpc("release_photo_upload", { p_upload_id: reservation.id });
      if (releaseError) console.error("Photo allowance release failed:", releaseError.message);
    }
    return Response.json({ error: "Could not save photo. Please retry." }, { status: 503 });
  }
  const { error: recordError } = await client.from("photo_uploads").update({ status: "uploaded" }).eq("id", reservation.id);
  if (recordError) console.error("Photo was saved but its reservation status could not be updated:", recordError.message);
  return Response.json({ saved: true, quota: reservation.quota }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const headers = { "Cache-Control": "private, no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin(request)) {
    return Response.json({ error: "Invalid photo deletion origin." }, { status: 403, headers });
  }

  const name = new URL(request.url).searchParams.get("name");
  const pathParts = name?.split("/") ?? [];
  if (
    !name ||
    name.length > 1024 ||
    name.includes("\\") ||
    name.split("").some((character) => character < " " || character === "\u007f") ||
    pathParts.some((part) => !part || part === "." || part === "..") ||
    !/\.(jpe?g|png|webp)$/i.test(name)
  ) {
    return Response.json({ error: "Invalid photo name." }, { status: 400, headers });
  }

  const client = createAdminClient();
  const { data: quota, error: roleError } = await client.rpc("get_photo_quota", {
    p_user_id: auth.user.id,
  });
  if (roleError || !isPhotoQuota(quota)) {
    console.error("Photo deletion role lookup failed:", roleError?.message ?? "Invalid booth profile.");
    return Response.json({ error: "Could not verify photo access. Please retry." }, { status: 503, headers });
  }
  if (quota.role !== "admin" && pathParts[0] !== auth.user.id) {
    return Response.json({ error: "Photo not found." }, { status: 404, headers });
  }

  const { error } = await client.storage.from("photos").remove([name]);
  if (error) {
    console.error("Photo deletion failed:", error.message);
    return Response.json({ error: "Could not delete photo. Please retry." }, { status: 503, headers });
  }
  return Response.json({ deleted: true }, { headers });
}
