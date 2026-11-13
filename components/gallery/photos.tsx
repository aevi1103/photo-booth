"use client";

import Image from "next/image";
import { useState } from "react";
import type { GalleryState } from "@/components/gallery/use-gallery";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useDeletePhoto } from "@/lib/queries/photos";

export function GalleryPhotos({ gallery }: { gallery: GalleryState }) {
	const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
	const [selectedNames, setSelectedNames] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const deletion = useDeletePhoto();
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
	const selectedPhotos = photos
		.filter((photo) => selectedNames.has(photo.name))
		.map((photo) => photo.name);

	return (
		<section
			className="rounded-[18px] border border-[#e6f0f5] bg-white p-5 shadow-[0_10px_35px_#8daec314]"
			aria-label="Saved photos"
		>
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
				<div className="flex flex-wrap gap-2">
					<Button
						variant="destructive"
						disabled={!selectedPhotos.length || deletion.isPending}
						onClick={() => {
							deletion.reset();
							setPhotosToDelete(selectedPhotos);
						}}
					>
						Delete selected ({selectedPhotos.length})
					</Button>
					<Button variant="outline" disabled={isFetching} onClick={refresh}>
						Refresh photos
					</Button>
				</div>
			</div>
			{loadError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
					{loadError.message}
				</p>
			)}
			{staleError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
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
						<label
							htmlFor={`select-${encodeURIComponent(photo.name)}`}
							className="flex items-center gap-2 p-3 text-sm"
						>
							<Checkbox
								id={`select-${encodeURIComponent(photo.name)}`}
								aria-label={`Select photo ${photo.name}`}
								checked={selectedNames.has(photo.name)}
								disabled={deletion.isPending}
								onCheckedChange={(checked) => {
									setSelectedNames((previous) => {
										const next = new Set(previous);
										if (checked) next.add(photo.name);
										else next.delete(photo.name);
										return next;
									});
								}}
							/>
							Select photo
						</label>
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
							<div className="flex items-center justify-between gap-3">
								<time dateTime={photo.createdAt}>
									{new Date(photo.createdAt).toLocaleString()}
								</time>
								<Button
									variant="destructive"
									size="sm"
									disabled={deletion.isPending}
									onClick={() => {
										deletion.reset();
										setPhotosToDelete([photo.name]);
									}}
								>
									Delete
								</Button>
							</div>
							{failedUrls.has(photo.url) && (
								<p className="text-[#934b43]" role="alert">
									Image unavailable or link expired. Refresh photos to retry.
								</p>
							)}
						</figcaption>
					</figure>
				))}
			</div>
			<Dialog
				open={photosToDelete.length > 0}
				onOpenChange={(open) => {
					if (!open && !deletion.isPending) setPhotosToDelete([]);
				}}
			>
				<DialogContent showCloseButton={!deletion.isPending}>
					<DialogHeader>
						<DialogTitle>
							{photosToDelete.length > 1
								? `Delete ${photosToDelete.length} selected photos?`
								: "Delete this photo?"}
						</DialogTitle>
						<DialogDescription>
							{photosToDelete.length > 1
								? "This permanently removes the selected photos and does not restore your upload allowance."
								: "This permanently removes the photo and does not restore your upload allowance."}
						</DialogDescription>
					</DialogHeader>
					{deletion.error && (
						<p className="text-[#934b43]" role="alert">
							{deletion.error.message}
						</p>
					)}
					<DialogFooter>
						<DialogClose
							disabled={deletion.isPending}
							render={<Button variant="outline" />}
						>
							Cancel
						</DialogClose>
						<Button
							variant="destructive"
							disabled={deletion.isPending}
							onClick={() => {
								deletion.mutate(photosToDelete, {
									onSuccess: () => {
										setSelectedNames(
											(previous) =>
												new Set(
													[...previous].filter(
														(name) => !photosToDelete.includes(name),
													),
												),
										);
										setPhotosToDelete([]);
									},
								});
							}}
						>
							{deletion.isPending
								? "Deleting…"
								: photosToDelete.length > 1
									? "Delete selected photos"
									: "Delete photo"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
