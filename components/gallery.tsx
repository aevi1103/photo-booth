"use client";

import { Cloud, Images } from "lucide-react";
import Link from "next/link";
import { GalleryPhotos } from "@/components/gallery/photos";
import { useGallery } from "@/components/gallery/use-gallery";
import { SignOut } from "@/components/sign-out";
import { buttonVariants } from "@/components/ui/button";

export function Gallery() {
	const gallery = useGallery();

	return (
		<main className="booth-shell gallery-shell">
			<header className="topbar">
				<div className="brand">
					<Cloud size={26} /> little cloud <span>PHOTO BOOTH</span>
				</div>
				<div className="account-navigation">
					<Link
						href="/"
						className={buttonVariants({
							variant: "outline",
							className: "booth-navigation",
						})}
					>
						Back to booth
					</Link>
					<SignOut />
				</div>
			</header>
			<section className="hero">
				<span className="eyebrow">
					<Images size={15} /> LITTLE MOMENTS, BIG MEMORIES
				</span>
				<h1>Photo gallery</h1>
				<p>
					Your saved baby-shower memories, newest first. Admins can view all
					event photos.
				</p>
			</section>
			<GalleryPhotos gallery={gallery} />
		</main>
	);
}
