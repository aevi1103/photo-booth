"use client";

import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
} from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { useStore } from "zustand";
import type { Backdrop, BoothStore } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";

export function BackdropCarousel({
	store,
	backgrounds,
}: {
	store: BoothStore;
	backgrounds: Backdrop[];
}) {
	const { background, countdown, photo } = useStore(store);
	const list = useRef<HTMLDivElement>(null);
	if (backgrounds.length <= 1) return null;
	const scroll = (direction: -1 | 1) =>
		list.current?.scrollBy({
			left: direction * 240,
			top: direction * 240,
			behavior: "smooth",
		});

	return (
		<section
			className="backdrop-picker mt-4 min-w-0 [.is-photo-mode_&]:hidden [@media(min-width:801px)_and_(min-height:600px)]:mt-0 [@media(min-width:801px)_and_(min-height:600px)]:w-[180px] [@media(min-width:801px)_and_(min-height:600px)]:shrink-0 [@media(min-width:801px)_and_(min-height:600px)]:self-center"
			aria-label="Choose a frame"
		>
			<h2 className="text-[16px] font-bold text-[#365e74] [@media(min-width:801px)_and_(min-height:600px)]:text-center">
				Choose a frame
			</h2>
			<div className="mt-2 flex items-center gap-2 [@media(min-width:801px)_and_(min-height:600px)]:flex-col">
				<Button
					variant="outline"
					aria-label="Previous backdrops"
					className="[@media(min-width:801px)_and_(min-height:600px)]:hidden"
					onClick={() => scroll(-1)}
				>
					<ChevronLeft />
				</Button>
				<Button
					variant="outline"
					aria-label="Previous backdrops"
					className="hidden [@media(min-width:801px)_and_(min-height:600px)]:inline-flex"
					onClick={() => scroll(-1)}
				>
					<ChevronUp />
				</Button>
				<div
					className="backdrop-list flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto [@media(min-width:801px)_and_(min-height:600px)]:max-h-[min(45vh,360px)] [@media(min-width:801px)_and_(min-height:600px)]:w-full [@media(min-width:801px)_and_(min-height:600px)]:flex-col [@media(min-width:801px)_and_(min-height:600px)]:snap-y [@media(min-width:801px)_and_(min-height:600px)]:overflow-y-auto"
					ref={list}
				>
					{backgrounds.map((item) => (
						<button
							key={item.url}
							type="button"
							className={`background-option min-w-0 flex-[0_0_140px] snap-start cursor-pointer overflow-hidden rounded-[9px] border-2 text-left disabled:cursor-not-allowed disabled:opacity-60 [@media(min-width:801px)_and_(min-height:600px)]:w-full [@media(min-width:801px)_and_(min-height:600px)]:flex-[0_0_auto] ${background === item.url ? "selected border-[#80b7d1]" : "border-[#edf4f7]"}`}
							aria-pressed={background === item.url}
							disabled={countdown !== null || photo !== null}
							onClick={() =>
								store.setState((state) => ({
									background: item.url,
									backgroundChosen: true,
									frameReady: state.background === item.url && state.frameReady,
								}))
							}
						>
							<Image
								className="h-[65px] w-full object-contain"
								src={item.url}
								alt=""
								width={140}
								height={80}
								unoptimized
							/>
							<span className="block overflow-hidden text-ellipsis whitespace-nowrap p-1.5 text-[11px]">
								{item.name}
							</span>
						</button>
					))}
				</div>
				<Button
					variant="outline"
					aria-label="Next backdrops"
					className="hidden [@media(min-width:801px)_and_(min-height:600px)]:inline-flex"
					onClick={() => scroll(1)}
				>
					<ChevronDown />
				</Button>
				<Button
					variant="outline"
					aria-label="Next backdrops"
					className="[@media(min-width:801px)_and_(min-height:600px)]:hidden"
					onClick={() => scroll(1)}
				>
					<ChevronRight />
				</Button>
			</div>
		</section>
	);
}
