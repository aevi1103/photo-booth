"use client";

import Image from "next/image";
import type { GalleryState } from "@/components/gallery/use-gallery";
import { Button } from "@/components/ui/button";

export function GalleryPhotos({ gallery }: { gallery: GalleryState }) {
	const {
		photos,
		isPending,
		loadError,
		staleError,
		isRefreshing,
		isFetchingNextPage,
		isFetching,
		isStale,
		updatedAt,
		hasNextPage,
		loadMore,
		refresh,
		failedUrls,
		markImageFailed,
	} = gallery;

	return (
		<section className="rounded-[18px] border border-[#e6f0f5] bg-white p-5 shadow-[0_10px_35px_#8daec314]" aria-label="Saved photos">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-5">
				<div>
					<p role="status">
						{isPending
							? "Loading photos..."
							: `${photos.length} ${photos.length === 1 ? "photo" : "photos"} loaded`}
						{isRefreshing && " · Refreshing…"}
					</p>
					{updatedAt > 0 && (
						<p className="text-xs leading-[1.5] text-[#8a9faa]">
							Updated {new Date(updatedAt).toLocaleTimeString()}
							{isStale && !isFetching && " · may be out of date"}
						</p>
					)}
				</div>
				<div className="flex gap-2">
					<Button variant="outline" disabled={isFetching} onClick={refresh}>
						Refresh photos
					</Button>
				</div>
			</div>
			{loadError && (
				<p className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]" role="alert">
					{loadError.message}
				</p>
			)}
			{staleError && (
				<p className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]" role="alert">
					{staleError.message} Showing previously loaded photos.
				</p>
			)}
			{!isPending && !loadError && !photos.length && (
				<p className="py-12 text-center">
					No photos yet. Capture a photo in the booth to start making memories.
				</p>
			)}
			<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{photos.map((photo) => (
					<figure
						key={photo.name}
						className="gallery-photo overflow-hidden rounded-xl border bg-white"
					>
						<a
							href={photo.url}
							target="_blank"
							rel="noopener noreferrer"
							referrerPolicy="no-referrer"
							aria-label={`Open photo ${photo.name}`}
						>
							<Image
								className="w-full aspect-[1153/768] object-contain"
								src={photo.url}
								alt={`Baby-shower memory ${photo.name}`}
								loading="lazy"
								width={1153}
								height={768}
								unoptimized
								referrerPolicy="no-referrer"
								onError={() => markImageFailed(photo.url)}
							/>
						</a>
						<figcaption className="p-3 text-sm text-[#6b8c9d]">
							{new Date(photo.createdAt).toLocaleString()}
							{failedUrls.has(photo.url) && (
								<p className="text-[#934b43]" role="alert">
									Image unavailable or link expired. Refresh photos to retry.
								</p>
							)}
						</figcaption>
					</figure>
				))}
			</div>
			<div className="mt-5 text-center">
				{isFetchingNextPage && <p role="status">Loading more photos...</p>}
				{hasNextPage && (
					<Button disabled={isFetching} onClick={loadMore}>
						Load more photos
					</Button>
				)}
			</div>
			<p className="mt-4 text-xs leading-[1.5] text-[#8a9faa]">
				Click a photo to open the full image. Private image links expire after
				15 minutes; they renew automatically while this page is open, or refresh
				to renew them now. Signing out does not revoke image links already
				opened or shared.
			</p>
		</section>
	);
}
