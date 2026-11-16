import type { GalleryPhoto } from "@/lib/queries/photos";
import { fetchDownloadImage, saveFile } from "./shareImage";

export async function downloadPhotos(photos: GalleryPhoto[]) {
	if (!photos.length) throw new Error("Select at least one photo.");
	if (photos.length === 1) {
		const photo = photos[0];
		saveFile(
			await fetchDownloadImage(
				photo.shareUrl ? `${photo.shareUrl}/image` : photo.url,
			),
		);
		return;
	}

	const { zipSync } = await import("fflate");
	const files: Record<string, Uint8Array> = {};
	// Fetch sequentially rather than flooding the server for large selections.
	for (const [index, photo] of photos.entries()) {
		const file = await fetchDownloadImage(
			photo.shareUrl ? `${photo.shareUrl}/image` : photo.url,
		);
		files[`${index + 1}-${file.name}`] = new Uint8Array(
			await file.arrayBuffer(),
		);
	}
	// JPEG, PNG, and WebP are already compressed.
	const archive = zipSync(files, { level: 0 });
	saveFile(
		new File([archive], "photo-memories.zip", { type: "application/zip" }),
	);
}
