import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { appOrigin } from "@/lib/app-origin";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  let config;
  try {
    config = getSupabaseConfig();
  } catch (error) {
    console.error("Authentication configuration failed:", error instanceof Error ? error.message : error);
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign-in is not configured. Contact the host." }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/login?error=configuration", appOrigin(request)));
  }
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (!user || error) {
    if (error && error.name !== "AuthSessionMissingError") console.error("Session validation failed:", error.message);
    const denied = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
      : NextResponse.redirect(new URL("/login", appOrigin(request)));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  }
  return response;
}

export const config = { matcher: ["/", "/gallery/:path*", "/api/:path*"] };
