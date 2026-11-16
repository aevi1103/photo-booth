"use client";

export function isIPadOrIPhone() {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

export async function printImage(src: string): Promise<void> {
	let objectUrl: string | undefined;
	try {
		const response = await fetch(src, { cache: "no-store" });
		if (!response.ok) throw new Error("Could not load the photo.");
		const blob = await response.blob();
		if (!blob.size || !blob.type.startsWith("image/")) {
			throw new Error("The photo is unavailable.");
		}
		objectUrl = URL.createObjectURL(blob);

		const iframe = document.createElement("iframe");
		iframe.title = "Photo print";
		Object.assign(iframe.style, {
			position: "fixed",
			width: "0",
			height: "0",
			border: "0",
		});
		document.body.append(iframe);

		const printFrame = iframe.contentWindow;
		const doc = iframe.contentDocument;
		if (!printFrame || !doc) {
			iframe.remove();
			throw new Error("Could not create the print document.");
		}
		const style = doc.createElement("style");
		style.textContent = `
			@page { margin: 0; }
			html, body { margin: 0; width: 100%; height: 100%; }
			img { display: block; width: 100%; height: 100%; object-fit: cover; }
		`;
		doc.head.append(style);
		const image = doc.createElement("img");
		image.alt = "Photo memory";
		const loaded = new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("Could not load the photo."));
		});
		image.src = objectUrl;
		doc.body.append(image);

		const urlToRevoke = objectUrl;
		let timer: number | undefined;
		const cleanup = () => {
			if (timer !== undefined) window.clearTimeout(timer);
			iframe.remove();
			URL.revokeObjectURL(urlToRevoke);
		};
		try {
			await loaded;
			if (typeof image.decode === "function") await image.decode();
			timer = window.setTimeout(cleanup, 60_000);
			printFrame.addEventListener(
				"afterprint",
				() => {
					// Safari can fire afterprint before its preview has captured the image.
					if (timer !== undefined) window.clearTimeout(timer);
					timer = window.setTimeout(cleanup, 60_000);
				},
				{ once: true },
			);
			printFrame.focus();
			printFrame.print();
		} catch (error) {
			cleanup();
			objectUrl = undefined;
			throw error;
		}
	} catch (error) {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		throw error;
	}
}
