"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
	return (
		<section className="backdrop-picker" aria-label="Choose a backdrop">
			<h2>Choose a backdrop</h2>
			<div className="backdrop-carousel">
				<Button
					variant="outline"
					aria-label="Previous backdrops"
					onClick={() =>
						list.current?.scrollBy({ left: -240, behavior: "smooth" })
					}
				>
					<ChevronLeft />
				</Button>
				<div className="backdrop-track" ref={list}>
					{backgrounds.map((item) => (
						<button
							key={item.url}
							type="button"
							className={`background-option${background === item.url ? " selected" : ""}`}
							aria-pressed={background === item.url}
							disabled={countdown !== null || photo !== null}
							onClick={() =>
								store.setState({
									background: item.url,
									backgroundChosen: true,
								})
							}
						>
							<Image
								src={item.url}
								alt=""
								width={140}
								height={80}
								unoptimized
							/>
							<span>{item.name}</span>
						</button>
					))}
				</div>
				<Button
					variant="outline"
					aria-label="Next backdrops"
					onClick={() =>
						list.current?.scrollBy({ left: 240, behavior: "smooth" })
					}
				>
					<ChevronRight />
				</Button>
			</div>
		</section>
	);
}
