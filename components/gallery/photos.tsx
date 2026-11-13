"use client";

import { Images, Printer, RefreshCw, Trash } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import type { GalleryState } from "@/components/gallery/use-gallery";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
	Carousel,
	type CarouselApi,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuota } from "@/lib/queries/account";
import { useDeletePhoto } from "@/lib/queries/photos";
import { cn } from "@/lib/utils";

export function GalleryPhotos({
	gallery,
	layout = "page",
}: {
	gallery: GalleryState;
	layout?: "page" | "booth";
}) {
	const booth = layout === "booth";
	const selectionId = useId();
	const quota = useQuota();
	const canDelete = !booth && quota.isSuccess && quota.data.role === "admin";
	const [viewedName, setViewedName] = useState<string | null>(null);
	const [carousel, setCarousel] = useState<CarouselApi>();
	const scrollRef = useRef<HTMLDivElement>(null);
	const newestName = gallery.photos[0]?.name;
	const previousNewest = useRef(newestName);
	useEffect(() => {
		if (booth && newestName && newestName !== previousNewest.current) {
			scrollRef.current?.scrollTo({ top: 0 });
			carousel?.scrollTo(0, true);
		}
		previousNewest.current = newestName;
	}, [booth, newestName, carousel]);
	const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
	const [printError, setPrintError] = useState("");
	const [selectedNames, setSelectedNames] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const printPhoto = useReactToPrint({
		ignoreGlobalStyles: true,
		pageStyle:
			"@page { size: auto; margin: 0; } body { margin: 0; } img { display: block; width: 100%; height: 100vh; object-fit: contain; }",
		onPrintError: () =>
			setPrintError("Could not print photo. Please try again."),
	});
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
	const viewedPhoto = photos.find((photo) => photo.name === viewedName);

	return (
		<Dialog
			open={!!viewedPhoto}
			onOpenChange={(open) => {
				if (!open) setViewedName(null);
			}}
		>
			<section
				className={cn(
					"min-w-0 rounded-2xl border bg-card p-5 text-card-foreground",
					booth &&
						"booth-gallery flex flex-col gap-3 border-border/50 bg-card/15 p-3 shadow-sm backdrop-blur-[2px] min-[801px]:h-[calc(100dvh-24px)] [.capture-shell:has(.booth-preview.is-photo-mode)_&]:hidden",
				)}
				aria-label="Saved photos"
			>
				<div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
					<div>
						{booth && (
							<h2 className="flex items-center gap-2">
								<Images className="size-4" /> Gallery
							</h2>
						)}
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
						{canDelete && (
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
						)}
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Refresh photos"
							title="Refresh photos"
							disabled={isFetching}
							onClick={refresh}
						>
							<RefreshCw />
						</Button>
					</div>
				</div>
				<div
					ref={scrollRef}
					className={cn(
						"gallery-scroll min-w-0",
						booth && "min-h-0 flex-1 min-[801px]:overflow-y-auto",
					)}
				>
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
					{printError && (
						<p
							className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
							role="alert"
						>
							{printError}
						</p>
					)}
					{!isPending && !loadError && !photos.length && (
						<p className="py-12 text-center">
							No photos yet. Capture a photo in the booth to start making
							memories.
						</p>
					)}
					<Carousel
						setApi={setCarousel}
						opts={{
							align: "start",
							active: booth,
							breakpoints: { "(min-width: 801px)": { active: false } },
						}}
						aria-label={booth ? "Photo gallery" : "Photo thumbnails"}
						aria-roledescription={booth ? "carousel" : undefined}
					>
						<CarouselContent
							className={cn(
								booth
									? "-ml-3 min-[801px]:ml-0 min-[801px]:grid min-[801px]:grid-cols-1 min-[801px]:gap-3"
									: "ml-0 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
							)}
						>
							{photos.map((photo) => (
								<CarouselItem
									key={photo.name}
									className={booth ? "basis-2/3 pl-3 min-[801px]:pl-0" : "pl-0"}
								>
									<figure
										className={cn(
											"gallery-photo overflow-hidden rounded-xl border bg-card",
											booth && "bg-transparent",
										)}
									>
										{canDelete && (
											<div className="flex gap-2 justify-between">
												<label
													htmlFor={`${selectionId}-${encodeURIComponent(photo.name)}`}
													className="flex items-center gap-2 p-2 text-xs"
												>
													<Checkbox
														id={`${selectionId}-${encodeURIComponent(photo.name)}`}
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
												</label>

												<Button
													variant={"ghost"}
													size="sm"
													aria-label="Delete"
													disabled={deletion.isPending}
													onClick={() => {
														deletion.reset();
														setPhotosToDelete([photo.name]);
													}}
												>
													<Trash className="h-4 w-4 text-red-500" />
												</Button>
											</div>
										)}
										<Tooltip disabled={!booth}>
											<TooltipTrigger
												render={
													<DialogTrigger
														render={
															<button
																type="button"
																className="block w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
															/>
														}
														aria-label={`Open photo ${photo.name}`}
														onClick={() => setViewedName(photo.name)}
													/>
												}
											>
												<AspectRatio ratio={3 / 2}>
													<div data-print-photo className="size-full">
														<Image
															className="size-full object-contain"
															src={photo.url}
															alt={`Baby-shower memory ${photo.name}`}
															loading="lazy"
															width={1153}
															height={768}
															unoptimized
															referrerPolicy="no-referrer"
															onError={() => markImageFailed(photo.url)}
														/>
													</div>
												</AspectRatio>
											</TooltipTrigger>
											<TooltipContent>
												Uploaded{" "}
												<time dateTime={photo.createdAt}>
													{new Date(photo.createdAt).toLocaleString()}
												</time>
											</TooltipContent>
										</Tooltip>
										{(!booth || failedUrls.has(photo.url)) && (
											<figcaption
												className={cn(
													"p-3 text-sm text-muted-foreground",
													booth && "p-2 text-xs",
												)}
											>
												{!booth && (
													<div className="flex flex-wrap items-center justify-between gap-2">
														<time
															dateTime={photo.createdAt}
															className="text-muted-foreground text-[10px]"
														>
															{new Date(photo.createdAt).toLocaleString()}
														</time>
														<div className="flex items-center gap-2">
															{!booth && (
																<Button
																	variant="outline"
																	size="icon-sm"
																	aria-label={`Print photo ${photo.name}`}
																	title="Print photo"
																	disabled={failedUrls.has(photo.url)}
																	onClick={(event) => {
																		setPrintError("");
																		const content = event.currentTarget
																			.closest("figure")
																			?.querySelector("[data-print-photo]");
																		if (!content) {
																			setPrintError(
																				"Could not print photo. Please try again.",
																			);
																			return;
																		}
																		printPhoto(() => content);
																	}}
																>
																	<Printer />
																</Button>
															)}
														</div>
													</div>
												)}
												{failedUrls.has(photo.url) && (
													<p className="text-[#934b43]" role="alert">
														Image unavailable or link expired. Refresh photos to
														retry.
													</p>
												)}
											</figcaption>
										)}
									</figure>
								</CarouselItem>
							))}
						</CarouselContent>
						{booth && photos.length > 0 && (
							<div className="mt-3 flex justify-end gap-2 min-[801px]:hidden">
								<CarouselPrevious className="static m-0" />
								<CarouselNext className="static m-0" />
							</div>
						)}
					</Carousel>
					<Dialog
						open={canDelete && photosToDelete.length > 0}
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
									disabled={deletion.isPending || !canDelete}
									render={<Button variant="outline" />}
								>
									Cancel
								</DialogClose>
								<Button
									variant="destructive"
									disabled={deletion.isPending || !canDelete}
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
				</div>
				<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle>Photo memory</DialogTitle>
						<DialogDescription>
							{viewedPhoto && new Date(viewedPhoto.createdAt).toLocaleString()}
						</DialogDescription>
					</DialogHeader>
					{viewedPhoto && (
						<>
							<Image
								src={viewedPhoto.url}
								alt="Full-size baby-shower memory"
								width={1536}
								height={1024}
								unoptimized
								referrerPolicy="no-referrer"
								className="max-h-[70dvh] w-full object-contain"
								onError={() => markImageFailed(viewedPhoto.url)}
							/>
							{failedUrls.has(viewedPhoto.url) && (
								<p role="alert">
									Image unavailable or link expired. Close this dialog and
									refresh photos to retry.
								</p>
							)}
						</>
					)}
				</DialogContent>
			</section>
		</Dialog>
	);
}
