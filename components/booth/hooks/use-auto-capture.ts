"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";
import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import {
	createFaceStillnessTracker,
	isFaceInCaptureArea,
	STILLNESS_SECONDS,
} from "@/lib/face-stillness";
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
			const faces = result.detections.flatMap((detection) =>
				detection.boundingBox ? [detection.boundingBox] : [],
			);
			return { faces, width: video.videoWidth, height: video.videoHeight };
		};
		const fail = (error: unknown) => {
			console.error("Automatic face detection failed:", error);
			tracker.reset();
			cancel();
			setStatus("Automatic capture is unavailable. Use Take a photo instead.");
		};
		const checkFace = () => {
			try {
				const result = detect();
				return result !== null && result.faces.length > 0;
			} catch (error) {
				fail(error);
				return false;
			}
		};
		autoFaceCheckRef.current = checkFace;

		const sample = () => {
			if (cancelled) return;
			try {
				const result = detect();
				if (!result?.faces.length) {
					tracker.reset();
					cancel();
					if (result && store.getState().autoCapturePaused)
						store.setState({ autoCapturePaused: false });
					setStatus("Waiting for a face.");
				} else if (store.getState().autoCapturePaused) {
					tracker.reset();
					setStatus(
						"Automatic capture paused. Step out of view or take a photo.",
					);
				} else {
					const faces = result.faces.filter((face) =>
						isFaceInCaptureArea(face, result.width, result.height),
					);
					if (tracker.update(faces, performance.now())) {
						startRef.current();
						setStatus("Face detected.");
					} else {
						setStatus(
							faces.length
								? `Face detected. Hold still for ${STILLNESS_SECONDS} second.`
								: "Face detected. Center your face and adjust your distance.",
						);
					}
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
