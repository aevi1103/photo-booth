let preparedImage: { url: string; file: File } | undefined;

async function imageFile(imageUrl: string) {
	if (preparedImage?.url === imageUrl) return preparedImage.file;
	const response = await fetch(imageUrl);
	if (!response.ok) throw new Error("Could not fetch the image.");
	const blob = await response.blob();
	const extensions: Record<string, string> = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp",
	};
	const extension = extensions[blob.type];
	if (typeof extension !== "string" || !blob.size) {
		throw new Error("The image is unavailable.");
	}
	const file = new File([blob], `photo-memory.${extension}`, {
		type: blob.type,
	});
	// Retain only the latest file so a second tap can share without losing activation.
	preparedImage = { url: imageUrl, file };
	return file;
}

export async function shareImage(
	imageUrl: string,
	pageUrl: string,
	title: string,
): Promise<"shared" | "cancelled" | "unsupported"> {
	try {
		if (
			typeof navigator.share !== "function" ||
			typeof navigator.canShare !== "function"
		) {
			return "unsupported";
		}
		const files = [await imageFile(imageUrl)];
		if (!navigator.canShare({ files })) return "unsupported";
		await navigator.share({ files, title, url: pageUrl });
		return "shared";
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			error.name === "AbortError"
		) {
			return "cancelled";
		}
		throw error;
	}
}

export async function downloadImage(imageUrl: string) {
	const file = await imageFile(imageUrl);
	const url = URL.createObjectURL(file);
	const link = document.createElement("a");
	try {
		link.href = url;
		link.download = file.name;
		document.body.append(link);
		link.click();
	} finally {
		link.remove();
		// Give Safari time to start consuming the object URL.
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}
}
