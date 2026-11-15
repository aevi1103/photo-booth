"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadImage } from "@/features/share/shareImage";

export function DownloadButton({ imageUrl }: { imageUrl: string }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	return (
		<div className="flex flex-col items-center gap-2">
			<Button
				disabled={busy}
				aria-busy={busy}
				onClick={async () => {
					setBusy(true);
					setError("");
					try {
						await downloadImage(imageUrl);
					} catch {
						setError("Could not download this photo. Please try again.");
					} finally {
						setBusy(false);
					}
				}}
			>
				<Download data-icon="inline-start" />
				{busy ? "Downloading..." : "Download image"}
			</Button>
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
