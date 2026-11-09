import { connection, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";

export async function GET(request: Request) {
  await connection();
  const origin = appOrigin(request);
  try {
    const client = await createSessionClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: new URL("/auth/callback", origin).toString() },
    });
    if (error || !data.url) {
      console.error("Google sign-in failed:", error?.message ?? "Missing OAuth URL.");
      return NextResponse.redirect(new URL("/login?error=signin", origin));
    }
    return NextResponse.redirect(data.url, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Google sign-in unavailable:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/login?error=configuration", origin));
  }
}
