"use client";

import { Cloud, Images } from "lucide-react";
import Link from "next/link";
import { GalleryPhotos } from "@/components/gallery/photos";
import { useGallery } from "@/components/gallery/use-gallery";
import { SignOut } from "@/components/sign-out";
import { Button } from "@/components/ui/button";

export function Gallery() {
	const gallery = useGallery();

	return (
		<main className="mx-auto w-full max-w-360 px-[6%] text-[#274c63] [--primary:#568eae] [--primary-foreground:#fff] [--foreground:#274c63] [--background:#f5faff] [--border:#dceaf2] [--muted:#e8f5fb] [--muted-foreground:#345d76] [--ring:#72a9c8]">
			<header className="topbar sticky top-0 z-30 flex h-20.5 items-center justify-between border-b border-[#e1edf4] bg-[linear-gradient(90deg,#f5faff00,#f5faffeb_18%,#f5faffeb_82%,#f5faff00)] backdrop-blur-[12px] [@media(max-width:480px)]:h-auto [@media(max-width:480px)]:min-h-[82px] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-3 [@media(max-width:480px)]:py-3.5">
				<div className="flex items-center gap-2 text-[22px] font-bold text-[#558eae] [@media(max-width:480px)]:text-[19px]">
					<Cloud size={26} /> little cloud{" "}
					<span className="ml-1 text-[9px] tracking-[.16em] text-[#9bb5c3] [@media(max-width:800px)]:hidden">
						PHOTO BOOTH
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Link href="/">
						<Button variant="outline">Back to booth</Button>
					</Link>
					<SignOut />
				</div>
			</header>
			<section className="px-3 pt-12.5 pb-8.75 text-center [@media(max-width:800px)]:pt-8">
				<span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[.18em] text-[#7aa4b9]">
					<Images size={15} /> LITTLE MOMENTS, BIG MEMORIES
				</span>
				<h1 className="mt-3.5 mb-2.25 font-[Georgia,serif] text-[clamp(32px,4vw,48px)] font-normal text-[#345d76]">
					Photo gallery
				</h1>
				<p className="text-[14px] text-[#89a1af]">
					Your saved baby-shower memories, newest first. Admins can view all
					event photos.
				</p>
			</section>
			<GalleryPhotos gallery={gallery} />
		</main>
	);
}
