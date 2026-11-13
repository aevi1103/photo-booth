import { Button } from "@/components/ui/button";

export function SignOut({ fullWidth }: { fullWidth?: boolean }) {
	return (
		<form action="/auth/logout" method="post">
			<Button
				type="submit"
				variant="outline"
				className={`cursor-pointer ${fullWidth ? "w-full" : ""}`}
			>
				Sign out
			</Button>
		</form>
	);
}
