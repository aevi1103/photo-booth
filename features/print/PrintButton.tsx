"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { printImage } from "@/features/print/printImage";

export function PrintButton({
	src,
	disabled = false,
	photoName,
}: {
	src: string;
	disabled?: boolean;
	photoName?: string;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	return (
		<div className="flex flex-col items-center gap-2">
			<Button
				variant="outline"
				size={photoName ? "icon-sm" : "sm"}
				aria-label={photoName ? `Print photo ${photoName}` : undefined}
				title={photoName ? "Print photo" : undefined}
				aria-busy={busy}
				disabled={disabled || busy}
				onClick={async () => {
					setBusy(true);
					setError("");
					try {
						await printImage(src);
					} catch (error) {
						setError(
							error instanceof Error &&
								error.message === "The print window was blocked."
								? "Allow pop-ups for this site, then try printing again."
								: "Could not print photo. Please try again.",
						);
					} finally {
						setBusy(false);
					}
				}}
			>
				<Printer data-icon={photoName ? undefined : "inline-start"} />
				{!photoName && (busy ? "Preparing..." : "Print")}
			</Button>
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
