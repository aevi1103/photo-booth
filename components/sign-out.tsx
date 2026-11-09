import { buttonVariants } from "@/components/ui/button";

export function SignOut() {
  return <form action="/auth/logout" method="post"><button type="submit" className={buttonVariants({ variant: "outline", className: "booth-navigation" })}>Sign out</button></form>;
}
