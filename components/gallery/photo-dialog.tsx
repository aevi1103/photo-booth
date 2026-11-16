"use client";

import Image from "next/image";
import { useState } from "react";
import {
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { QrCode, QrCodeFrame } from "@/components/ui/qr-code";
import { PrintButton } from "@/features/print/PrintButton";
import { DownloadButton } from "@/features/share/DownloadButton";
import { ShareButton } from "@/features/share/ShareButton";
import type { GalleryPhoto } from "@/lib/queries/photos";

export function PhotoDialogContent({
	photo,
	autoClose = false,
}: {
	photo: GalleryPhoto;
	autoClose?: boolean;
}) {
	const [failedUrl, setFailedUrl] = useState("");
	const failed = failedUrl === photo.url;
	return (
		<DialogContent
			className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-6xl"
			overlayProps={{
				className: "bg-black/40 supports-backdrop-filter:backdrop-blur-md",
				forceRender: true,
			}}
		>
			<DialogHeader>
				<DialogTitle>Photo memory</DialogTitle>
				<DialogDescription>
					{new Date(photo.createdAt).toLocaleString()}
					{autoClose && " · This preview closes automatically after 1 minute."}
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-wrap items-start gap-3">
				<DownloadButton
					imageUrl={photo.shareUrl ? `${photo.shareUrl}/image` : photo.url}
					disabled={failed}
				/>
				{photo.shareUrl && (
					<ShareButton
						imageUrl={`${photo.shareUrl}/image`}
						pageUrl={photo.shareUrl}
						title="Nugget Photo Booth memory"
					/>
				)}
				<PrintButton
					src={photo.shareUrl ? `${photo.shareUrl}/image` : photo.url}
					disabled={failed}
				/>
			</div>
			<div className="grid min-w-0 items-center gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
				<div className="min-w-0">
					<Image
						src={photo.url}
						alt="Full-size baby-shower memory"
						width={1536}
						height={1024}
						unoptimized
						referrerPolicy="no-referrer"
						className="max-h-[65dvh] w-full object-contain"
						onError={() => setFailedUrl(photo.url)}
					/>
					{failed && (
						<p role="alert">
							Image unavailable or link expired. Close this dialog and refresh
							photos to retry.
						</p>
					)}
				</div>
				{photo.shareUrl && (
					<section
						aria-label="Scan to download"
						className="flex flex-col items-center gap-3 text-center"
					>
						<h2 className="font-medium">Scan to download</h2>
						<QrCode value={photo.shareUrl} encoding={{ ecc: "M" }}>
							<QrCodeFrame className="size-56 p-4" />
						</QrCode>
						<p className="text-sm text-muted-foreground">
							Scan with your phone, then choose Download image. No sign-in
							needed.
						</p>
						<p className="text-sm text-muted-foreground">
							Shared links let anyone view this photo for seven days.
						</p>
					</section>
				)}
			</div>
		</DialogContent>
	);
}
