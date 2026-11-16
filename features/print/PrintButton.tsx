"use client";

import { Printer } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isIPadOrIPhone, printImage } from "@/features/print/printImage";
import { imageFile } from "@/features/share/shareImage";

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
	const [message, setMessage] = useState("");
	const prepared = useRef<{ src: string; file: File } | null>(null);

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
					setMessage("");
					try {
						if (isIPadOrIPhone()) {
							if (!navigator.share || !navigator.canShare) {
								setError(
									"Download the photo and print it from the Photos app.",
								);
								return;
							}
							let file =
								prepared.current?.src === src ? prepared.current.file : null;
							if (!file) {
								file = await imageFile(src);
								prepared.current = { src, file };
							}
							if (!navigator.canShare({ files: [file] })) {
								setError(
									"Download the photo and print it from the Photos app.",
								);
								return;
							}
							setMessage("Choose Print in the share sheet.");
							await navigator.share({ files: [file] });
						} else {
							await printImage(src);
						}
					} catch (error) {
						if (error instanceof DOMException && error.name === "AbortError") {
							setMessage("");
							return;
						}
						if (
							error instanceof DOMException &&
							error.name === "NotAllowedError" &&
							isIPadOrIPhone()
						) {
							setMessage("Photo ready. Tap Print again, then choose Print.");
							return;
						}
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
			{message && <p role="status">{message}</p>}
		</div>
	);
}
