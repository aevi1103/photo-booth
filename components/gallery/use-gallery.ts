"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type GalleryPhoto = { name: string; createdAt: string; url: string };
type PhotoPage = { photos: GalleryPhoto[]; nextOffset: number | null };

async function fetchPhotos(offset: number) {
	const response = await fetch(`/api/photos?offset=${offset}`, {
		cache: "no-store",
		signal: AbortSignal.timeout(20_000),
	});
	const result = await response.json();
	if (!response.ok) {
		const error = new Error(
			result.error || "Could not load photos. Please retry.",
		);
		if (response.status === 401) error.name = "SignInRequired";
		throw error;
	}
	return result as PhotoPage;
}

export function useGallery() {
	const router = useRouter();
	const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
	const [nextOffset, setNextOffset] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [failedImages, setFailedImages] = useState<string[]>([]);

	const load = useCallback(
		(offset = 0) => {
			return fetchPhotos(offset)
				.then((result) => {
					setError("");
					setPhotos((previous) =>
						offset === 0
							? result.photos
							: [
									...previous,
									...result.photos.filter(
										(photo) =>
											!previous.some((item) => item.name === photo.name),
									),
								],
					);
					setNextOffset(result.nextOffset);
					setFailedImages([]);
				})
				.catch((cause: unknown) => {
					if (cause instanceof Error && cause.name === "SignInRequired") {
						setPhotos([]);
						setNextOffset(null);
						router.replace("/login");
					}
					setError(
						cause instanceof Error
							? cause.message
							: "Could not load photos. Check your connection and retry.",
					);
				})
				.finally(() => {
					setLoading(false);
				});
		},
		[router],
	);

	const refresh = useCallback(() => {
		setLoading(true);
		void load();
	}, [load]);

	const loadMore = useCallback(
		(offset: number) => {
			setLoading(true);
			void load(offset);
		},
		[load],
	);

	useEffect(() => {
		void load();
	}, [load]);

	const markImageFailed = useCallback((name: string) => {
		setFailedImages((previous) =>
			previous.includes(name) ? previous : [...previous, name],
		);
	}, []);

	return {
		photos,
		nextOffset,
		loading,
		error,
		failedImages,
		refresh,
		loadMore,
		markImageFailed,
	};
}
