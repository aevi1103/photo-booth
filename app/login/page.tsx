import { Suspense } from "react";
import { Cloud } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

async function LoginMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return <p className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]" role="alert">{error === "configuration"
    ? "Sign-in is not configured. Ask the host to set the Supabase URL and publishable key."
    : "Google sign-in did not complete. Please try again. The host may need to check the Supabase Google provider and redirect URLs."}</p>;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-[6%] text-[#274c63] [--primary:#568eae] [--primary-foreground:#fff] [--foreground:#274c63] [--background:#f5faff] [--border:#dceaf2] [--muted:#e8f5fb] [--muted-foreground:#345d76] [--ring:#72a9c8]">
      <header className="topbar sticky top-0 z-30 flex h-[82px] items-center justify-between border-b border-[#e1edf4] bg-[linear-gradient(90deg,#f5faff00,#f5faffeb_18%,#f5faffeb_82%,#f5faff00)] backdrop-blur-[12px] [@media(max-width:480px)]:h-auto [@media(max-width:480px)]:min-h-[82px] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-3 [@media(max-width:480px)]:py-3.5"><div className="flex items-center gap-2 text-[22px] font-bold text-[#558eae] [@media(max-width:480px)]:text-[19px]"><Cloud size={26} /> little cloud <span className="ml-1 text-[9px] tracking-[.16em] text-[#9bb5c3] [@media(max-width:800px)]:hidden">PHOTO BOOTH</span></div></header>
      <section className="px-3 pt-[50px] pb-[35px] text-center [@media(max-width:800px)]:pt-8"><span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[.18em] text-[#7aa4b9]">A LITTLE ONE IS ON THE WAY</span><h1 className="mt-3.5 mb-[9px] font-[Georgia,serif] text-[clamp(32px,4vw,48px)] font-normal text-[#345d76]">A little memory starts here</h1><p className="text-[14px] text-[#89a1af]">Sign in to join the baby-shower photo booth.</p></section>
      <section className="mx-auto max-w-[420px] rounded-[18px] border border-[#e6f0f5] bg-white p-6 shadow-[0_10px_35px_#8daec314]">
        <h2 className="text-[16px] font-bold text-[#365e74]">Welcome to little cloud</h2>
        <p className="mt-3 text-xs leading-[1.5] text-[#8a9faa]">Sign in with Google to take photos and view your memories. Each guest can save up to 20 photos.</p>
        <a href="/auth/login" className={buttonVariants({ size: "lg", className: "mt-5 w-full" })}>Continue with Google</a>
        <p className="mt-4 text-xs leading-[1.5] text-[#8a9faa]">Photos are stored privately. You can see your own photos; the host&apos;s admins can see all event photos.</p>
        <Suspense fallback={null}><LoginMessage searchParams={searchParams} /></Suspense>
      </section>
    </main>
  );
}
