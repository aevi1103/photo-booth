"use client";

import Image from "next/image";
import type { GalleryPhoto } from "@/components/gallery/use-gallery";
import { Button } from "@/components/ui/button";

export function GalleryPhotos({
	photos,
	nextOffset,
	loading,
	failedImages,
	onRefresh,
	onLoadMore,
	onImageError,
}: {
	photos: GalleryPhoto[];
	nextOffset: number | null;
	loading: boolean;
	failedImages: string[];
	onRefresh: () => void;
	onLoadMore: (offset: number) => void;
	onImageError: (name: string) => void;
}) {
	return (
		<section className="preview-card p-5" aria-label="Saved photos">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-5">
				<p role="status">
					{photos.length} {photos.length === 1 ? "photo" : "photos"} loaded
				</p>
				<div className="flex gap-2">
					<Button variant="outline" disabled={loading} onClick={onRefresh}>
						Refresh photos
					</Button>
				</div>
			</div>
			{!photos.length && !loading && (
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
								onError={() => onImageError(photo.name)}
							/>
						</a>
						<figcaption className="p-3 text-sm">
							{new Date(photo.createdAt).toLocaleString()}
							{failedImages.includes(photo.name) && (
								<p role="alert">
									Image unavailable or link expired. Refresh photos to retry.
								</p>
							)}
						</figcaption>
					</figure>
				))}
			</div>
			<div className="mt-5 text-center">
				{loading && <p role="status">Loading photos...</p>}
				{nextOffset !== null && (
					<Button disabled={loading} onClick={() => onLoadMore(nextOffset)}>
						Load more photos
					</Button>
				)}
			</div>
			<p className="small mt-4">
				Click a photo to open the full image. Private image links expire after
				15 minutes; refresh to renew them. Signing out does not revoke image
				links already opened or shared.
			</p>
		</section>
	);
}
