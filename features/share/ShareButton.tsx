"use client";

import { Copy, Download, Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { downloadImage, shareImage } from "./shareImage";

type Props = { imageUrl: string; pageUrl: string; title: string };

export function ShareButton({ imageUrl, pageUrl, title }: Props) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const encodedUrl = encodeURIComponent(pageUrl);
	const encodedTitle = encodeURIComponent(title);

	async function perform(action: () => Promise<void>, failure: string) {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch {
			setError(failure);
			setOpen(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setOpen(false);
			}}
		>
			<PopoverTrigger
				render={<Button variant="outline" size="sm" />}
				aria-label="Share to socials"
				aria-busy={busy}
				disabled={busy}
				onClick={() => {
					if (open) {
						setOpen(false);
						return;
					}
					void perform(async () => {
						if (
							(await shareImage(imageUrl, pageUrl, title)) === "unsupported"
						) {
							setOpen(true);
						}
					}, "Could not share this photo. Tap Share again, refresh photos, or use a link below.");
				}}
			>
				{busy ? (
					<Loader2
						data-icon="inline-start"
						aria-hidden="true"
						className="animate-spin"
					/>
				) : (
					<Share2 data-icon="inline-start" aria-hidden="true" />
				)}
				{busy ? "Preparing..." : "Share"}
			</PopoverTrigger>
			<PopoverContent align="start">
				<PopoverHeader>
					<PopoverTitle>Share to socials</PopoverTitle>
					<PopoverDescription>
						Anyone with this link can view the photo for seven days. Social
						platforms may keep a copy.
					</PopoverDescription>
				</PopoverHeader>
				{error && <p role="alert">{error}</p>}
				<div className="flex flex-col gap-2">
					{[
						[
							"Facebook",
							`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
						],
						[
							"X",
							`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
						],
						["WhatsApp", `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`],
					].map(([label, href]) => (
						<a
							key={label}
							className={buttonVariants({ variant: "outline" })}
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							referrerPolicy="no-referrer"
						>
							{label}
						</a>
					))}
					<Button
						variant="outline"
						disabled={busy}
						onClick={() => {
							void perform(async () => {
								await navigator.clipboard.writeText(pageUrl);
								toast.add({ title: "Copied", type: "success" });
							}, "Could not copy the link. Allow clipboard access and try again.");
						}}
					>
						<Copy data-icon="inline-start" aria-hidden="true" />
						Copy link
					</Button>
					<Button
						variant="outline"
						disabled={busy}
						onClick={() => {
							void perform(
								() => downloadImage(imageUrl),
								"Could not download the image. Refresh photos and try again.",
							);
						}}
					>
						<Download data-icon="inline-start" aria-hidden="true" />
						Download image
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
