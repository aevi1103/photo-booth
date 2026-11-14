"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { Backdrop, BoothStore } from "@/components/booth/store/store";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";

export function BackdropCarousel({
	store,
	backgrounds,
}: {
	store: BoothStore;
	backgrounds: Backdrop[];
}) {
	const { background, countdown, shotIndex, photo } = useStore(store);
	const [isVertical, setIsVertical] = useState(false);
	useEffect(() => {
		const media = window.matchMedia(
			"(min-width: 801px) and (min-height: 600px)",
		);
		const updateOrientation = () => setIsVertical(media.matches);
		updateOrientation();
		media.addEventListener("change", updateOrientation);
		return () => media.removeEventListener("change", updateOrientation);
	}, []);
	if (backgrounds.length <= 1) return null;

	return (
		<section
			className="backdrop-picker mt-4 min-w-0 in-[.is-photo-mode]:hidden
			[@media(min-width:801px)_and_(min-height:600px)]:mt-0 [@media(min-width:801px)_and_(min-height:600px)]:w-40
			 [@media(min-width:801px)_and_(min-height:600px)]:shrink-0 [@media(min-width:801px)_and_(min-height:600px)]:self-center"
			aria-label="Choose a frame"
		>
			<h2 className="text-[16px] font-bold text-[#365e74] [@media(min-width:801px)_and_(min-height:600px)]:text-center">
				Choose a frame
			</h2>
			<Carousel
				orientation={isVertical ? "vertical" : "horizontal"}
				className="mt-2 flex w-full min-w-0 items-center gap-2 [@media(min-width:801px)_and_(min-height:600px)]:flex-col [@media(min-width:801px)_and_(min-height:600px)]:items-stretch [@media(min-width:801px)_and_(min-height:600px)]:[&_[data-slot=carousel-content]]:max-h-[min(45vh,360px)]"
			>
				<CarouselPrevious
					aria-label="Previous backdrops"
					className="static size-9 shrink-0 rounded-md [@media(min-width:801px)_and_(min-height:600px)]:translate-x-0"
				/>
				<div className="min-w-0 flex-1 [@media(min-width:801px)_and_(min-height:600px)]:w-full [@media(min-width:801px)_and_(min-height:600px)]:flex-none">
					<CarouselContent className="backdrop-list -ml-2 gap-0 [@media(min-width:801px)_and_(min-height:600px)]:-mt-2 [@media(min-width:801px)_and_(min-height:600px)]:ml-0">
						{backgrounds.map((item) => (
							<CarouselItem
								key={item.url}
								className="basis-35 pl-2 [@media(min-width:801px)_and_(min-height:600px)]:basis-auto
								 [@media(min-width:801px)_and_(min-height:600px)]:pl-0 [@media(min-width:801px)_and_(min-height:600px)]:pt-2"
							>
								<button
									type="button"
									className={`background-option block w-full min-w-0 cursor-pointer overflow-hidden rounded-[9px] border-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${background === item.url ? "selected border-[#80b7d1]" : "border-[#edf4f7]"}`}
									aria-pressed={background === item.url}
									disabled={
										countdown !== null || shotIndex !== null || photo !== null
									}
									onClick={() =>
										store.setState((state) => ({
											background: item.url,
											backgroundChosen: true,
											frameReady:
												state.background === item.url && state.frameReady,
										}))
									}
								>
									<Image
										className="aspect-video w-full object-contain"
										src={item.url}
										alt=""
										width={140}
										height={80}
										unoptimized
									/>
								</button>
							</CarouselItem>
						))}
					</CarouselContent>
				</div>
				<CarouselNext
					aria-label="Next backdrops"
					className="static size-9 shrink-0 rounded-md [@media(min-width:801px)_and_(min-height:600px)]:translate-x-0"
				/>
			</Carousel>
		</section>
	);
}
