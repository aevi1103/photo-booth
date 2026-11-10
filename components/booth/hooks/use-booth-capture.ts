"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { MAX_PHOTO_BYTES, PHOTO_SIZE_ERROR } from "@/lib/photo-limits";
import { isPhotoQuota } from "@/lib/photo-quota";
import type { useBoothSounds } from "@/lib/use-booth-sounds";

type CaptureSounds = Pick<ReturnType<typeof useBoothSounds>, "play">;

export function useBoothCapture({
	store,
	canvasRef,
	streamRef,
	sounds,
	refreshQuota,
}: {
	store: BoothStore;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	streamRef: RefObject<MediaStream | null>;
	sounds: CaptureSounds;
	refreshQuota: () => Promise<void>;
}) {
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

	async function upload(blob: Blob) {
		store.setState({ uploadStatus: "saving", uploadState: "Saving photo…" });
		try {
			if (blob.size > MAX_PHOTO_BYTES) throw new Error(PHOTO_SIZE_ERROR);
			const response = await fetch("/api/photos", {
				method: "POST",
				headers: { "Content-Type": "image/jpeg" },
				body: blob,
				signal: AbortSignal.timeout(20_000),
			});
			const result = (await response.json()) as {
				error?: string;
				saved?: boolean;
				quota?: unknown;
			};
			if (isPhotoQuota(result.quota)) store.setState({ quota: result.quota });
			if (!response.ok)
				throw new Error(result.error ?? "Could not save photo.");
			if (result.saved !== true)
				throw new Error("The server did not confirm that the photo was saved.");
			store.setState({
				uploadStatus: "saved",
				uploadState: "Saved privately for the host.",
			});
		} catch (error) {
			store.setState({
				uploadStatus: "failed",
				uploadState:
					error instanceof Error
						? `Not saved online: ${error.message}`
						: "Not saved online.",
			});
			void refreshQuota();
		}
	}

	function capture() {
		const source = canvasRef.current;
		const state = store.getState();
		if (
			!source?.width ||
			!state.connected ||
			!state.frameReady ||
			streamRef.current?.getVideoTracks()[0]?.readyState !== "live"
		) {
			captureBusyRef.current = false;
			store.setState({
				message:
					"Connect a camera and wait for the frame before taking a photo.",
			});
			return;
		}
		const output = document.createElement("canvas");
		output.width = source.width;
		output.height = source.height;
		const context = output.getContext("2d");
		if (!context) {
			captureBusyRef.current = false;
			store.setState({ message: "Could not create the photo." });
			return;
		}
		context.drawImage(source, 0, 0);
		sounds.play("shutter");
		output.toBlob(
			(blob) => {
				if (!blob) {
					captureBusyRef.current = false;
					store.setState({ message: "Could not export the photo." });
					return;
				}
				store.setState({ photo: { blob, url: URL.createObjectURL(blob) } });
				void upload(blob);
			},
			"image/jpeg",
			0.94,
		);
	}

	function startCountdown() {
		const state = store.getState();
		if (
			!state.connected ||
			!state.frameReady ||
			!state.quota ||
			state.quota.remaining === 0 ||
			state.photo ||
			captureBusyRef.current ||
			streamRef.current?.getVideoTracks()[0]?.readyState !== "live"
		)
			return;
		captureBusyRef.current = true;
		store.setState({ message: "", countdown: 3 });
		sounds.play("countdown");
		let value = 3;
		const tick = () => {
			value -= 1;
			if (value === 0) {
				store.setState({ countdown: null });
				capture();
				return;
			}
			store.setState({ countdown: value });
			sounds.play("countdown");
			timerRef.current = setTimeout(tick, 1000);
		};
		timerRef.current = setTimeout(tick, 1000);
	}

	const handleCameraInterruption = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		store.setState({ countdown: null });
		captureBusyRef.current = false;
	}, [store]);

	function retake() {
		captureBusyRef.current = false;
		store.setState({ photo: null, uploadState: "", uploadStatus: "idle" });
	}

	return { upload, startCountdown, handleCameraInterruption, retake };
}
