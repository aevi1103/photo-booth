import { buttonVariants } from "@/components/ui/button";

export function SignOut() {
  return <form action="/auth/logout" method="post"><button type="submit" className={buttonVariants({ variant: "outline", className: "booth-navigation border-[#dceaf2] font-[inherit] text-[#558eae] hover:bg-[#e8f5fb] hover:text-[#345d76]" })}>Sign out</button></form>;
}
