"use client";

import { Images, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { useBoothController } from "@/components/booth/hooks/use-booth-controller";
import { BoothPreview } from "@/components/booth/preview";
import type { Backdrop } from "@/components/booth/store/store";
import { GalleryPhotos } from "@/components/gallery/photos";
import { useGallery } from "@/components/gallery/use-gallery";
import PixelSnow from "@/components/PixelSnow";
import { SignOut } from "@/components/sign-out";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { useBackdrops } from "@/lib/queries/backdrops";
import { cn } from "@/lib/utils";

export function Booth({ backgrounds: defaults }: { backgrounds: Backdrop[] }) {
	const [menuOpen, setMenuOpen] = useState(false);
	const gallery = useGallery();
	const backdrops = useBackdrops();
	const uploaded = backdrops.data;
	const backgrounds = useMemo(() => {
		const seen = new Set<string>();
		return [...defaults, ...(uploaded ?? [])].filter((item) => {
			if (seen.has(item.url)) return false;
			seen.add(item.url);
			return true;
		});
	}, [uploaded, defaults]);
	const {
		store,
		sounds,
		voice,
		camera,
		canvasRef,
		quota,
		canCapture,
		startCountdown,
		connect,
		upload,
		uploadView,
		discard,
		save,
		retake,
		prepareSound,
	} = useBoothController(backgrounds);
	const galleryVisible = useStore(store, (state) => state.galleryVisible);

	useEffect(() => {
		const captureOnEnter = (event: KeyboardEvent) => {
			if (
				menuOpen ||
				event.key !== "Enter" ||
				event.repeat ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				(event.target instanceof Element &&
					event.target.closest(
						"button, a, input, select, textarea, [contenteditable], [role=button], [role=link]",
					))
			)
				return;
			event.preventDefault();
			startCountdown();
		};
		window.addEventListener("keydown", captureOnEnter);
		return () => window.removeEventListener("keydown", captureOnEnter);
	}, [menuOpen, startCountdown]);

	useEffect(() => {
		if (backdrops.isPending) return;
		const { background } = store.getState();
		const adminDefault = backgrounds.find((item) => item.isDefault);
		const defaultUrl = adminDefault?.url ?? defaults[0]?.url ?? "";
		if (background !== defaultUrl)
			store.setState({
				background: defaultUrl,
				backgroundChosen: false,
				frameReady: false,
			});
	}, [backdrops.isPending, backgrounds, defaults, store]);

	return (
		<Drawer open={menuOpen} onOpenChange={setMenuOpen}>
			<main className="booth-shell capture-shell mx-auto min-h-dvh w-full max-w-none px-[clamp(12px,2vw,32px)] py-3 min-[801px]:px-[clamp(16px,2vw,32px)] has-[.booth-preview.is-photo-mode]:fixed has-[.booth-preview.is-photo-mode]:inset-0 has-[.booth-preview.is-photo-mode]:z-[100] has-[.booth-preview.is-photo-mode]:m-0 has-[.booth-preview.is-photo-mode]:h-dvh has-[.booth-preview.is-photo-mode]:w-screen has-[.booth-preview.is-photo-mode]:overflow-hidden has-[.booth-preview.is-photo-mode]:bg-black has-[.booth-preview.is-photo-mode]:p-0 [&:has(.booth-preview.is-photo-mode)>:not(.booth-grid)]:hidden">
				<h1 className="sr-only">Nugget Photo Booth</h1>
				<DrawerContent className="text-[#274c63]">
					<DrawerHeader>
						<DrawerTitle>Menu</DrawerTitle>
						<DrawerDescription>
							View your memories or manage your account.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerClose
						render={
							<Button
								variant="ghost"
								className="absolute top-4 right-4"
								size="icon-sm"
							/>
						}
					>
						<X />
						<span className="sr-only">Close</span>
					</DrawerClose>
					<nav
						className="grid gap-2.5 p-4 pt-3 [&_.booth-navigation]:min-h-11 [&_.booth-navigation]:w-full"
						aria-label="Booth menu"
					>
						{quota.data?.role === "admin" && (
							<Link href="/admin/backdrops" onClick={() => setMenuOpen(false)}>
								<Button variant="outline" className="w-full cursor-pointer">
									Manage backdrops
								</Button>
							</Link>
						)}
						<Link href="/gallery" onClick={() => setMenuOpen(false)}>
							<Button variant="outline" className="w-full cursor-pointer">
								View gallery
							</Button>
						</Link>
						<SignOut fullWidth />
					</nav>
				</DrawerContent>
				<div
					className="quota-status mx-auto max-w-180 text-center text-xs text-[#568eae] [&_button]:mt-2 [&_p+p]:mt-2"
					aria-live="polite"
				>
					{quota.data ? (
						<p className="sr-only">
							{quota.data.role === "admin"
								? "Admin account · Unlimited photo uploads"
								: `${quota.data.remaining} of 20 photo uploads remaining`}
							{quota.isRefetchError && " (last known)"}
							{quota.isFetching && (
								<span
									className="text-xs leading-normal text-[#8a9faa]"
									aria-hidden="true"
								>
									{" "}
									· updating…
								</span>
							)}
						</p>
					) : (
						quota.isPending && (
							<p className="sr-only">Loading your upload allowance...</p>
						)
					)}
					{quota.data?.remaining === 0 && (
						<p>
							You have reached your total of 20 photos. You can still view your
							memories in the gallery.
						</p>
					)}
					{quota.isError && (
						<>
							<p
								className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
								role="alert"
							>
								{quota.error.message}
							</p>
							<Button
								variant="outline"
								disabled={quota.isFetching}
								onClick={() => void quota.refetch()}
							>
								Retry allowance
							</Button>
						</>
					)}
				</div>
				<div
					className={cn(
						`booth-grid mx-auto grid max-w-none grid-cols-1 items-start gap-5
				 min-[801px]:gap-4 [@media(min-width:801px)_and_(min-height:600px)]:h-[calc(100dvh-24px)]
				  [.capture-shell:has(.booth-preview.is-photo-mode)_&]:absolute
					 [.capture-shell:has(.booth-preview.is-photo-mode)_&]:inset-0 
					 [.capture-shell:has(.booth-preview.is-photo-mode)_&]:m-0
					  [.capture-shell:has(.booth-preview.is-photo-mode)_&]:block
						 [.capture-shell:has(.booth-preview.is-photo-mode)_&]:h-full
						  [.capture-shell:has(.booth-preview.is-photo-mode)_&]:w-full`,
						galleryVisible &&
							"min-[801px]:grid-cols-[minmax(0,1fr)_clamp(220px,20vw,300px)]",
					)}
				>
					<BoothPreview
						store={store}
						backdropError={
							backdrops.isError ? backdrops.error.message : undefined
						}
						onRetryBackdrops={() => void backdrops.refetch()}
						camera={camera}
						canvasRef={canvasRef}
						sounds={sounds}
						voice={voice}
						onCapture={startCountdown}
						onDiscard={discard}
						onSave={save}
						onRetake={retake}
						onUpload={upload}
						upload={uploadView}
						canCapture={canCapture}
						onPrepareSound={prepareSound}
						onConnect={(deviceId) => void connect(deviceId)}
						menu={
							<>
								<Button
									variant="outline"
									size="lg"
									aria-label={galleryVisible ? "Hide gallery" : "Show gallery"}
									title={galleryVisible ? "Hide gallery" : "Show gallery"}
									aria-controls="booth-gallery"
									aria-expanded={galleryVisible}
									onClick={() => {
										store.setState((state) => ({
											galleryVisible: !state.galleryVisible,
										}));
									}}
								>
									<Images data-icon="inline-start" />
									<span className="hidden xl:inline">
										{galleryVisible ? "Hide gallery" : "Show gallery"}
									</span>
								</Button>
								<DrawerTrigger render={<Button variant="outline" size="lg" />}>
									<Menu /> <span className="sr-only sm:not-sr-only">Menu</span>
								</DrawerTrigger>
							</>
						}
					/>
					<div id="booth-gallery" className="min-w-0" hidden={!galleryVisible}>
						<GalleryPhotos gallery={gallery} layout="booth" />
					</div>
				</div>
				<div className="booth-snow" aria-hidden="true">
					<PixelSnow
						color="#80b7d1"
						speed={0.5}
						density={0.55}
						lightMode
						mouseInteraction={false}
						dpr={0.75}
					/>
				</div>
			</main>
		</Drawer>
	);
}
