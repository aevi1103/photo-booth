"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { BoothStore, Settings } from "@/components/booth/store/store";
import type { createCompositor } from "@/lib/compositor";
import { renderPrint, withPrintDpi } from "@/lib/print-layout";
import { canCaptureFromCache } from "@/lib/queries/account";
import { useUploadPhoto } from "@/lib/queries/photos";
import type { useBoothSounds } from "@/lib/use-booth-sounds";

type CaptureSounds = Pick<ReturnType<typeof useBoothSounds>, "play">;
type Compositor = ReturnType<typeof createCompositor>;
export type UploadView = {
	status: "idle" | "saving" | "saved" | "failed";
	message: string;
};

const COUNTDOWN_SECONDS = 5;
// Lets guests see the shot land and reposition before the next box starts.
const BETWEEN_SHOTS_MS = 1500;
const CAMERA_NOT_READY =
	"Connect a camera and wait for the frame before taking a photo.";

export function useBoothCapture({
	store,
	canvasRef,
	videoRef,
	compositorRef,
	settingsRef,
	streamRef,
	sounds,
}: {
	store: BoothStore;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	videoRef: RefObject<HTMLVideoElement | null>;
	compositorRef: RefObject<Compositor | null>;
	settingsRef: RefObject<Settings>;
	streamRef: RefObject<MediaStream | null>;
	sounds: CaptureSounds;
}) {
	const queryClient = useQueryClient();
	const uploadMutation = useUploadPhoto();
	const resetUpload = uploadMutation.reset;
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const captureBusyRef = useRef(false);
	const { photo } = useStore(store);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	useEffect(
		() => () => {
			if (photo) URL.revokeObjectURL(photo.url);
		},
		[photo],
	);

	const cameraLive = useCallback(
		() => streamRef.current?.getVideoTracks()[0]?.readyState === "live",
		[streamRef],
	);

	const cancelSequence = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
		compositorRef.current?.resetSlots();
		store.setState({ countdown: null, shotIndex: null });
	}, [compositorRef, store]);

	function fail(message: string) {
		cancelSequence();
		captureBusyRef.current = false;
		store.setState({ message });
	}

	function upload(blob: Blob) {
		uploadMutation.mutate(blob, {
			onSuccess: () => {
				captureBusyRef.current = false;
				compositorRef.current?.resetSlots();
				store.setState({ photo: null });
			},
		});
	}

	function exportPhoto() {
		const source = canvasRef.current;
		const video = videoRef.current;
		const compositor = compositorRef.current;
		if (!source?.width || !video || !compositor) return fail(CAMERA_NOT_READY);
		compositor.draw(video, settingsRef.current);
		const output = renderPrint(source);
		if (!output) return fail("Could not create the photo.");
		output.toBlob(
			async (encoded) => {
				if (!encoded) return fail("Could not export the photo.");
				const blob = await withPrintDpi(encoded);
				store.setState({
					shotIndex: null,
					photo: { blob, url: URL.createObjectURL(blob) },
				});
			},
			"image/jpeg",
			0.94,
		);
	}

	function shoot(index: number) {
		const state = store.getState();
		const video = videoRef.current;
		const compositor = compositorRef.current;
		if (
			!video ||
			video.readyState < 2 ||
			!compositor ||
			!canvasRef.current?.width ||
			!state.connected ||
			!state.frameReady ||
			!cameraLive()
		)
			return fail(CAMERA_NOT_READY);
		try {
			compositor.freezeSlot(index, video);
		} catch (error) {
			return fail(
				error instanceof Error ? error.message : "Could not capture the photo.",
			);
		}
		sounds.play("shutter");
		const next = index + 1;
		if (next >= Math.max(1, state.frameOpenings.length)) return exportPhoto();
		compositor.setActiveSlot(next);
		store.setState({ shotIndex: next });
		timerRef.current = setTimeout(() => countdown(next), BETWEEN_SHOTS_MS);
	}

	function countdown(index: number) {
		compositorRef.current?.setActiveSlot(index);
		store.setState({ shotIndex: index, countdown: COUNTDOWN_SECONDS });
		sounds.play("countdown");
		let value = COUNTDOWN_SECONDS;
		const tick = () => {
			value -= 1;
			if (value === 0) {
				store.setState({ countdown: null });
				shoot(index);
				return;
			}
			store.setState({ countdown: value });
			sounds.play("countdown");
			timerRef.current = setTimeout(tick, 1000);
		};
		timerRef.current = setTimeout(tick, 1000);
	}

	function startCountdown() {
		const state = store.getState();
		if (
			!state.connected ||
			!state.frameReady ||
			!canCaptureFromCache(queryClient) ||
			state.photo ||
			state.shotIndex !== null ||
			captureBusyRef.current ||
			!cameraLive()
		)
			return;
		captureBusyRef.current = true;
		resetUpload();
		compositorRef.current?.resetSlots();
		store.setState({ message: "" });
		countdown(0);
	}

	const handleCameraInterruption = useCallback(() => {
		if (store.getState().photo) {
			if (timerRef.current) clearTimeout(timerRef.current);
			return;
		}
		cancelSequence();
		captureBusyRef.current = false;
	}, [cancelSequence, store]);

	function save() {
		const current = store.getState().photo;
		if (current && uploadMutation.status === "idle") upload(current.blob);
	}

	function discard() {
		cancelSequence();
		captureBusyRef.current = false;
		store.setState({ photo: null });
		resetUpload();
	}

	function retake() {
		if (uploadMutation.status !== "idle") return;
		discard();
		startCountdown();
	}

	const uploadView: UploadView =
		uploadMutation.status === "pending"
			? { status: "saving", message: "Saving photo…" }
			: uploadMutation.status === "success"
				? { status: "saved", message: "Saved privately for the host." }
				: uploadMutation.status === "error"
					? {
							status: "failed",
							message: `Not saved online: ${uploadMutation.error.message}`,
						}
					: { status: "idle", message: "" };

	return {
		upload,
		uploadView,
		startCountdown,
		handleCameraInterruption,
		save,
		retake,
		discard,
	};
}
