"use client";

import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { initialSettings } from "@/components/booth/store/store";
import { createCompositor } from "@/lib/compositor";

type Compositor = ReturnType<typeof createCompositor>;

export function useBoothPreview(store: BoothStore) {
	const { settings, background, connected } = useStore(store);
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const compositorRef = useRef<Compositor | null>(null);
	const settingsRef = useRef(initialSettings);

	useEffect(() => {
		settingsRef.current = settings;
	}, [settings]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
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
		let animation = 0;
		const render = () => {
			try {
				const video = videoRef.current;
				if (video && video.readyState >= 2)
					compositor.draw(video, settingsRef.current);
				animation = requestAnimationFrame(render);
			} catch (error) {
				store.setState({
					frameReady: false,
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
			compositor.destroy();
			compositorRef.current = null;
		};
	}, [store]);

	// The shared default image is the frame overlay; the camera shows
	// through its transparent areas.
	useEffect(() => {
		store.setState({ frameReady: false, frameError: "" });
		if (!background) return;
		let cancelled = false;
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => {
			if (cancelled || !compositorRef.current) return;
			try {
				const frameSize = compositorRef.current.setFrame(image);
				const video = videoRef.current;
				if (video && video.readyState >= 2)
					compositorRef.current.draw(video, settingsRef.current);
				store.setState({ frameReady: true, frameSize });
			} catch (error) {
				store.setState({
					frameError:
						error instanceof Error
							? error.message
							: "Could not use the frame. Refresh the page or contact the host.",
				});
			}
		};
		image.onerror = () => {
			if (!cancelled)
				store.setState({
					frameError:
						"Could not load that frame image. Refresh the page or contact the host.",
				});
		};
		image.src = background;
		return () => {
			cancelled = true;
		};
	}, [background, store]);

	// Warn when green-screen replacement is on but the camera sees no key color,
	// which otherwise makes selected backdrops silently invisible.
	useEffect(() => {
		const video = videoRef.current;
		if (!connected || !video) return;
		const sampler = document.createElement("canvas");
		sampler.width = 48;
		sampler.height = 27;
		const context = sampler.getContext("2d", { willReadFrequently: true });
		if (!context) return;
		const update = (value: boolean | null) => {
			if (store.getState().keyDetected !== value)
				store.setState({ keyDetected: value });
		};
		// Same chroma mapping as the compositor shader.
		const chroma = (red: number, green: number, blue: number) => {
			const sum = Math.max(red + green + blue, 0.001);
			return [blue / sum - green / sum, red / sum - green / sum];
		};
		const sample = () => {
			const { color, threshold, greenScreen } = settingsRef.current;
			if (!greenScreen) return update(null);
			const key = color.match(/[a-f\d]{2}/gi);
			if (key?.length !== 3 || video.readyState < 2) return;
			const [keyBlue, keyRed] = chroma(
				...(key.map((part) => parseInt(part, 16) / 255) as [
					number,
					number,
					number,
				]),
			);
			context.drawImage(video, 0, 0, sampler.width, sampler.height);
			const pixels = context.getImageData(
				0,
				0,
				sampler.width,
				sampler.height,
			).data;
			let keyed = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				const [blue, red] = chroma(
					pixels[index] / 255,
					pixels[index + 1] / 255,
					pixels[index + 2] / 255,
				);
				if (Math.hypot(blue - keyBlue, red - keyRed) <= threshold) keyed++;
			}
			update(keyed / (pixels.length / 4) >= 0.02);
		};
		sample();
		const timer = setInterval(sample, 1500);
		return () => {
			clearInterval(timer);
			update(null);
		};
	}, [connected, store]);

	return { videoRef, canvasRef, compositorRef, settingsRef };
}
