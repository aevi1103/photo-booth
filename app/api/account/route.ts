import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPhotoQuota } from "@/lib/photo-quota";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { data, error } = await createAdminClient().rpc("get_photo_quota", { p_user_id: auth.user.id });
  if (error || !isPhotoQuota(data)) {
    console.error("Photo quota lookup failed:", error?.message ?? "Missing or invalid booth profile.");
    return Response.json({ error: "Could not load your upload allowance. Ask the host to check the Supabase setup, then retry." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ quota: data, email: auth.user.email }, { headers: { "Cache-Control": "private, no-store" } });
}
