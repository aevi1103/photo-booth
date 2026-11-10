"use client";

import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { initialSettings } from "@/components/booth/store/store";
import { createCompositor } from "@/lib/compositor";

type Compositor = ReturnType<typeof createCompositor>;

export function useBoothPreview(store: BoothStore) {
	const { settings, background } = useStore(store);
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const compositorRef = useRef<Compositor | null>(null);
	const settingsRef = useRef(initialSettings);

	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const video = videoRef.current;
		if (!canvas || !video) return;
		let compositor: Compositor;
		try {
			compositor = createCompositor(canvas);
		} catch (error) {
			queueMicrotask(() =>
				store.setState({
					message:
						error instanceof Error
							? error.message
							: "Could not start the preview.",
				}),
			);
			return;
		}
		compositorRef.current = compositor;
		const frameImage = new Image();
		frameImage.onload = () => {
			try {
				compositor.setFrame(frameImage);
				store.setState({ frameReady: true });
			} catch (error) {
				store.setState({
					message:
						error instanceof Error
							? error.message
							: "Could not load the photo frame.",
				});
			}
		};
		frameImage.onerror = () =>
			store.setState({
				message:
					"Could not load the photo frame. Refresh the page and try again.",
			});
		frameImage.src = "/frames/baby-shower.png";
		let animation = 0;
		const render = () => {
			try {
				if (video.readyState >= 2) compositor.draw(video, settingsRef.current);
				animation = requestAnimationFrame(render);
			} catch (error) {
				store.setState({
					message:
						error instanceof Error
							? error.message
							: "Could not render the camera preview.",
				});
			}
		};
		animation = requestAnimationFrame(render);
		return () => {
			cancelAnimationFrame(animation);
			frameImage.onload = null;
			frameImage.onerror = null;
			compositor.destroy();
			compositorRef.current = null;
		};
	}, [store]);

	useEffect(() => {
		if (!background) return;
		let cancelled = false;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => {
			if (cancelled) return;
			try {
				compositorRef.current?.setBackground(image);
			} catch {
				store.setState({
					message:
						"Could not use that background. Check its storage access and try another image.",
				});
			}
		};
		image.onerror = () => {
			if (!cancelled)
				store.setState({ message: "Could not load that background image." });
		};
		image.src = background;
		return () => {
			cancelled = true;
		};
	}, [background, store]);

	return { videoRef, canvasRef, compositorRef, settingsRef };
}
