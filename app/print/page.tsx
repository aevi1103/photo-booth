"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

function PrintPageContent() {
	const src = useSearchParams().get("src");
	const [error, setError] = useState("");
	const [ready, setReady] = useState(false);
	const printed = useRef(false);

	if (!src?.startsWith("blob:")) {
		return (
			<p role="alert">
				This print link is invalid. Return to the gallery and try again.
			</p>
		);
	}

	function print() {
		try {
			window.print();
		} catch {
			setError("Could not open the print dialog. Please try again.");
		}
	}

	return (
		<main className="print-page">
			<style>{`
				@page { margin: 0; }
				html, body { margin: 0; width: 100%; height: 100%; }
				body { display: block; }
				.print-page { width: 100%; height: 100%; }
				.print-page img { display: block; width: 100%; height: 100%; object-fit: cover; }
				.print-controls { position: fixed; top: 1rem; left: 1rem; z-index: 1; padding: 1rem; background: white; color: black; }
				@media print { .print-controls { display: none; } }
			`}</style>
			<div className="print-controls">
				<button type="button" disabled={!ready} onClick={print}>
					Print photo
				</button>
				<p>If the print dialog did not open, tap Print photo.</p>
				{error && <p role="alert">{error}</p>}
			</div>
			<Image
				src={src}
				alt="Photo memory"
				width={1800}
				height={1200}
				unoptimized
				onLoad={() => {
					setReady(true);
					setError("");
					if (!printed.current) {
						printed.current = true;
						print();
					}
				}}
				onError={() => {
					setReady(false);
					setError(
						"Could not load this photo. Return to the gallery and try again.",
					);
				}}
			/>
		</main>
	);
}

export default function PrintPage() {
	return (
		<Suspense fallback={<p>Preparing photo...</p>}>
			<PrintPageContent />
		</Suspense>
	);
}
