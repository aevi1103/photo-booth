"use client";

import { useCallback, useState } from "react";
import { useGalleryPhotos, useRefreshGallery } from "@/lib/queries/photos";

export function useGallery() {
	const query = useGalleryPhotos();
	const refresh = useRefreshGallery();
	// UI-only state: which signed URLs failed to render. Renewed URLs start clean.
	const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(new Set());

	const markImageFailed = useCallback((url: string) => {
		setFailedUrls((previous) =>
			previous.has(url) ? previous : new Set(previous).add(url),
		);
	}, []);

	return {
		photos: query.data ?? [],
		isPending: query.isPending,
		// Initial load failed with nothing to show.
		loadError: query.isError && !query.data ? query.error : null,
		// A refresh or later page failed; previously loaded photos stay visible.
		staleError: query.data && query.isError ? query.error : null,
		isRefreshing:
			query.isFetching && !query.isPending && !query.isFetchingNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
		isFetching: query.isFetching,
		isStale: query.isStale,
		updatedAt: query.dataUpdatedAt,
		hasNextPage: query.hasNextPage,
		loadMore: () => void query.fetchNextPage(),
		refresh: () => void refresh(),
		failedUrls,
		markImageFailed,
	};
}

export type GalleryState = ReturnType<typeof useGallery>;
