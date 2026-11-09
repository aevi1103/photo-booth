import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-origin";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin(request)) {
    return NextResponse.json({ error: "Invalid sign-out origin." }, { status: 403 });
  }
  const client = await createSessionClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    console.error("Sign-out failed:", error.message);
    return NextResponse.json({ error: "Could not sign out. Please retry." }, { status: 503 });
  }
  return NextResponse.redirect(new URL("/login", appOrigin(request)), { status: 303, headers: { "Cache-Control": "no-store" } });
}
