import { Suspense } from "react";
import { Cloud } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

async function LoginMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return <p className="notice" role="alert">{error === "configuration"
    ? "Sign-in is not configured. Ask the host to set the Supabase URL and publishable key."
    : "Google sign-in did not complete. Please try again. The host may need to check the Supabase Google provider and redirect URLs."}</p>;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="booth-shell gallery-shell">
      <header className="topbar"><div className="brand"><Cloud size={26} /> little cloud <span>PHOTO BOOTH</span></div></header>
      <section className="hero"><span className="eyebrow">A LITTLE ONE IS ON THE WAY</span><h1>A little memory starts here</h1><p>Sign in to join the baby-shower photo booth.</p></section>
      <section className="controls-card login">
        <h2>Welcome to little cloud</h2>
        <p className="small mt-3">Sign in with Google to take photos and view your memories. Each guest can save up to 20 photos.</p>
        <a href="/auth/login" className={buttonVariants({ size: "lg", className: "mt-5 w-full" })}>Continue with Google</a>
        <p className="small mt-4">Photos are stored privately. You can see your own photos; the host&apos;s admins can see all event photos.</p>
        <Suspense fallback={null}><LoginMessage searchParams={searchParams} /></Suspense>
      </section>
    </main>
  );
}
