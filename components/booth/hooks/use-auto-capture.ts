"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";
import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { createFaceStillnessTracker } from "@/lib/face-stillness";
import { canCaptureFromCache } from "@/lib/queries/account";

const SAMPLE_MS = 200;
const MAX_FRAME_AGE_MS = 750;

export function useAutoCapture({
	store,
	videoRef,
	streamRef,
	autoFaceCheckRef,
	ready,
	start,
	cancel,
}: {
	store: BoothStore;
	videoRef: RefObject<HTMLVideoElement | null>;
	streamRef: RefObject<MediaStream | null>;
	autoFaceCheckRef: RefObject<(() => boolean) | null>;
	ready: boolean;
	start: () => void;
	cancel: () => void;
}) {
	const queryClient = useQueryClient();
	const {
		autoCapture,
		autoCountdown,
		connected,
		frameReady,
		photo,
		shotIndex,
	} = useStore(store);
	const [status, setStatus] = useState("Starting face detection…");
	const startRef = useRef(start);
	useEffect(() => {
		startRef.current = start;
	}, [start]);
	const monitoring =
		ready &&
		autoCapture &&
		connected &&
		frameReady &&
		!photo &&
		(shotIndex === null || autoCountdown);

	useEffect(() => {
		if (!monitoring) {
			cancel();
			return;
		}
		let cancelled = false;
		let detector: FaceDetector | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let lastVideoTime = -1;
		let lastFrameAt = 0;
		let lastTimestamp = 0;
		const tracker = createFaceStillnessTracker();

		const allowed = () => {
			const state = store.getState();
			const track = streamRef.current?.getVideoTracks()[0];
			return (
				!document.hidden &&
				state.autoCapture &&
				state.connected &&
				state.frameReady &&
				!state.photo &&
				!state.savedPreviewOpen &&
				(state.shotIndex === null || state.autoCountdown) &&
				track?.readyState === "live" &&
				!track.muted &&
				canCaptureFromCache(queryClient)
			);
		};
		const detect = () => {
			const video = videoRef.current;
			const now = performance.now();
			if (!allowed() || !detector || !video || video.readyState < 2)
				return null;
			if (video.currentTime !== lastVideoTime) {
				lastVideoTime = video.currentTime;
				lastFrameAt = now;
			}
			if (!lastFrameAt || now - lastFrameAt > MAX_FRAME_AGE_MS) return null;
			lastTimestamp = Math.max(now, lastTimestamp + 0.01);
			const result = detector.detectForVideo(video, lastTimestamp);
			return result.detections.flatMap((detection) =>
				detection.boundingBox ? [detection.boundingBox] : [],
			);
		};
		const fail = (error: unknown) => {
			console.error("Automatic face detection failed:", error);
			tracker.reset();
			cancel();
			setStatus("Automatic capture is unavailable. Use Take a photo instead.");
		};
		const checkFace = () => {
			try {
				const faces = detect();
				return faces !== null && faces.length > 0;
			} catch (error) {
				fail(error);
				return false;
			}
		};
		autoFaceCheckRef.current = checkFace;

		const sample = () => {
			if (cancelled) return;
			try {
				const faces = detect();
				if (!faces?.length) {
					tracker.reset();
					cancel();
					setStatus("Waiting for a face.");
				} else if (tracker.update(faces, performance.now())) {
					startRef.current();
					setStatus("Face detected.");
				} else {
					setStatus("Face detected. Hold still for 5 seconds.");
				}
				timer = setTimeout(sample, SAMPLE_MS);
			} catch (error) {
				fail(error);
			}
		};
		const visibilityChanged = () => {
			if (document.hidden) {
				tracker.reset();
				lastVideoTime = -1;
				lastFrameAt = 0;
				cancel();
			}
		};
		document.addEventListener("visibilitychange", visibilityChanged);
		void (async () => {
			try {
				const { FaceDetector, FilesetResolver } = await import(
					"@mediapipe/tasks-vision"
				);
				const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
				const instance = await FaceDetector.createFromOptions(vision, {
					baseOptions: {
						modelAssetPath: "/models/blaze_face_short_range.tflite",
					},
					runningMode: "VIDEO",
				});
				if (cancelled) {
					instance.close();
					return;
				}
				detector = instance;
				sample();
			} catch (error) {
				if (!cancelled) fail(error);
			}
		})();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			document.removeEventListener("visibilitychange", visibilityChanged);
			if (autoFaceCheckRef.current === checkFace)
				autoFaceCheckRef.current = null;
			detector?.close();
			cancel();
		};
	}, [
		autoFaceCheckRef,
		cancel,
		monitoring,
		queryClient,
		store,
		streamRef,
		videoRef,
	]);

	return {
		status: !autoCapture
			? "Automatic capture is off."
			: monitoring
				? status
				: "Automatic capture waits until the booth is ready.",
		error: monitoring && status.startsWith("Automatic capture is unavailable"),
	};
}
