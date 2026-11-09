import { createSessionClient } from "@/lib/supabase/server";

export async function requireUser() {
  const client = await createSessionClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    if (error && error.name !== "AuthSessionMissingError") console.error("API session validation failed:", error.message);
    return { response: Response.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  }
  return { user };
}
