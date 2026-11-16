export function printPhoto(image: HTMLImageElement | null) {
	if (!image?.complete || !image.naturalWidth) {
		throw new Error("The photo is not ready to print.");
	}

	const previous = document.querySelector("[data-photo-print]");
	previous?.remove();

	const content = document.createElement("div");
	content.dataset.photoPrint = "";
	const copy = image.cloneNode() as HTMLImageElement;
	copy.removeAttribute("class");
	copy.removeAttribute("style");
	copy.removeAttribute("loading");
	content.append(copy);

	const style = document.createElement("style");
	style.textContent = `
		[data-photo-print] { display: none; }
		@media print {
			@page { size: auto; margin: 0; }
			html, body { margin: 0 !important; height: auto !important; overflow: visible !important; }
			body { background: white !important; }
			body > :not([data-photo-print]) { display: none !important; }
			[data-photo-print] { display: block; }
			[data-photo-print] img { display: block; width: 100%; height: 100vh; object-fit: contain; }
		}
	`;
	content.prepend(style);
	document.body.append(content);

	const cleanup = () => content.remove();
	window.addEventListener("afterprint", cleanup, { once: true });
	try {
		window.print();
	} catch (error) {
		window.removeEventListener("afterprint", cleanup);
		cleanup();
		throw error;
	}
}
