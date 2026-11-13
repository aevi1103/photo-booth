import {
	type InfiniteData,
	infiniteQueryOptions,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { MAX_PHOTO_BYTES, PHOTO_SIZE_ERROR } from "@/lib/photo-limits";
import { isPhotoQuota, type PhotoQuota } from "@/lib/photo-quota";
import { accountKeys, reserveOne } from "@/lib/queries/account";
import { ApiError, isRecord, requestJson } from "@/lib/queries/http";

export type GalleryPhoto = { name: string; createdAt: string; url: string };
export type PhotoPage = { photos: GalleryPhoto[]; nextOffset: number | null };

const PHOTO_LIST_ERROR = "Could not load photos. Please retry.";
// Signed photo URLs expire after 15 minutes; renew well before that.
const SIGNED_URL_REFRESH_MS = 10 * 60_000;

export const photoKeys = {
	all: ["photos"] as const,
	lists: () => [...photoKeys.all, "list"] as const,
	gallery: () => [...photoKeys.lists(), "newest"] as const,
	upload: () => [...photoKeys.all, "upload"] as const,
};

function isGalleryPhoto(value: unknown): value is GalleryPhoto {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		typeof value.createdAt === "string" &&
		typeof value.url === "string"
	);
}

async function fetchPhotoPage(
	offset: number,
	signal: AbortSignal,
): Promise<PhotoPage> {
	const body = await requestJson(
		`/api/photos?offset=${offset}`,
		PHOTO_LIST_ERROR,
		{ signal },
	);
	if (
		!isRecord(body) ||
		!Array.isArray(body.photos) ||
		!body.photos.every(isGalleryPhoto) ||
		!(body.nextOffset === null || typeof body.nextOffset === "number")
	) {
		throw new Error(PHOTO_LIST_ERROR);
	}
	return { photos: body.photos, nextOffset: body.nextOffset };
}

// Offsets shift when photos are added between page loads, so drop repeats across pages.
function flattenPages(data: InfiniteData<PhotoPage, number>) {
	const seen = new Set<string>();
	return data.pages
		.flatMap((page) => page.photos)
		.filter((photo) => !seen.has(photo.name) && seen.add(photo.name));
}

export const photoQueries = {
	gallery: () =>
		infiniteQueryOptions({
			queryKey: photoKeys.gallery(),
			queryFn: ({ pageParam, signal }) => fetchPhotoPage(pageParam, signal),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.nextOffset,
			staleTime: 5 * 60_000,
			// Never resurrect a cached list whose signed URLs have likely expired.
			gcTime: SIGNED_URL_REFRESH_MS,
			refetchInterval: SIGNED_URL_REFRESH_MS,
		}),
};

export function useGalleryPhotos() {
	return useInfiniteQuery({ ...photoQueries.gallery(), select: flattenPages });
}

/** Collapses the gallery to its first page and refetches it in the background, renewing signed URLs. */
export function useRefreshGallery() {
	const queryClient = useQueryClient();
	return useCallback(() => {
		const queryKey = photoKeys.gallery();
		queryClient.setQueryData<InfiniteData<PhotoPage, number>>(
			queryKey,
			(data) =>
				data && {
					pages: data.pages.slice(0, 1),
					pageParams: data.pageParams.slice(0, 1),
				},
		);
		return queryClient.invalidateQueries({ queryKey, exact: true });
	}, [queryClient]);
}

async function deletePhoto(name: string): Promise<void> {
	const body = await requestJson(
		`/api/photos?name=${encodeURIComponent(name)}`,
		"Could not delete photo.",
		{ method: "DELETE" },
	);
	if (!isRecord(body) || body.deleted !== true)
		throw new Error("The server did not confirm that the photo was deleted.");
}

export function useDeletePhoto() {
	const refresh = useRefreshGallery();
	return useMutation({
		mutationFn: async (names: string[]) => {
			const results = await Promise.allSettled(names.map(deletePhoto));
			const failures = results.filter((result) => result.status === "rejected");
			if (failures.length) {
				if (names.length === 1) throw failures[0].reason;
				throw new Error(
					`${failures.length} of ${names.length} photos could not be deleted. Please retry the remaining photos.`,
				);
			}
		},
		onSettled: () => refresh(),
	});
}

async function uploadPhoto(blob: Blob): Promise<{ quota?: PhotoQuota }> {
	if (blob.size > MAX_PHOTO_BYTES) throw new Error(PHOTO_SIZE_ERROR);
	const body = await requestJson("/api/photos", "Could not save photo.", {
		method: "POST",
		headers: { "Content-Type": "image/jpeg" },
		body: blob,
	});
	if (!isRecord(body) || body.saved !== true)
		throw new Error("The server did not confirm that the photo was saved.");
	return { quota: isPhotoQuota(body.quota) ? body.quota : undefined };
}

export function useUploadPhoto() {
	const queryClient = useQueryClient();
	const quotaKey = accountKeys.quota();

	return useMutation({
		mutationKey: photoKeys.upload(),
		mutationFn: uploadPhoto,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: quotaKey });
			const previous = queryClient.getQueryData<PhotoQuota>(quotaKey);
			if (previous) queryClient.setQueryData(quotaKey, reserveOne(previous));
			return { previous };
		},
		onSuccess: ({ quota }) => {
			if (quota) queryClient.setQueryData(quotaKey, quota);
			else void queryClient.invalidateQueries({ queryKey: quotaKey });
			// Only the photo lists changed; inactive galleries are marked stale and refetch when next shown.
			void queryClient.invalidateQueries({ queryKey: photoKeys.lists() });
		},
		onError: (error, _blob, context) => {
			const serverQuota =
				error instanceof ApiError && isRecord(error.body)
					? error.body.quota
					: undefined;
			if (isPhotoQuota(serverQuota)) {
				queryClient.setQueryData(quotaKey, serverQuota);
				return;
			}
			if (context?.previous)
				queryClient.setQueryData(quotaKey, context.previous);
			// The server may have kept the reservation for an uncertain upload, so confirm the real allowance.
			void queryClient.invalidateQueries({ queryKey: quotaKey });
		},
	});
}
