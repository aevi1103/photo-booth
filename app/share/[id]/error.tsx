"use client";

import { Button } from "@/components/ui/button";

export default function ShareError({ retry }: { retry: () => void }) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
			<h1 className="text-2xl font-semibold">Could not load this photo</h1>
			<p>The photo is temporarily unavailable. Please try again.</p>
			<Button onClick={retry}>Try again</Button>
		</main>
	);
}
