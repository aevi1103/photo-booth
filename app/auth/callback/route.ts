import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    try {
      const client = await createSessionClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", appOrigin(request)), { headers: { "Cache-Control": "no-store" } });
      console.error("Google callback failed:", error.message);
    } catch (error) {
      console.error("Google callback unavailable:", error instanceof Error ? error.message : error);
    }
  }
  return NextResponse.redirect(new URL("/login?error=signin", appOrigin(request)));
}
