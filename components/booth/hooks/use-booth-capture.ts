"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { canCaptureFromCache } from "@/lib/queries/account";
import { useUploadPhoto } from "@/lib/queries/photos";
import type { useBoothSounds } from "@/lib/use-booth-sounds";

type CaptureSounds = Pick<ReturnType<typeof useBoothSounds>, "play">;
export type UploadView = {
	status: "idle" | "saving" | "saved" | "failed";
	message: string;
};

export function useBoothCapture({
	store,
	canvasRef,
	streamRef,
	sounds,
}: {
	store: BoothStore;
	canvasRef: RefObject<HTMLCanvasElement | null>;
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

	function upload(blob: Blob) {
		uploadMutation.mutate(blob, {
			onSuccess: () => {
				captureBusyRef.current = false;
				store.setState({ photo: null });
			},
		});
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
			!canCaptureFromCache(queryClient) ||
			state.photo ||
			captureBusyRef.current ||
			streamRef.current?.getVideoTracks()[0]?.readyState !== "live"
		)
			return;
		captureBusyRef.current = true;
		resetUpload();
		store.setState({ message: "", countdown: 5 });
		sounds.play("countdown");
		let value = 5;
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

	function discard() {
		captureBusyRef.current = false;
		store.setState({ photo: null });
		resetUpload();
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
		discard,
	};
}
