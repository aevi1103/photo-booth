"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type Webcam from "react-webcam";
import type { BoothStore, Settings } from "@/components/booth/store/store";
import type { createCompositor } from "@/lib/compositor";
import type { useBoothSounds } from "@/lib/use-booth-sounds";

type Compositor = ReturnType<typeof createCompositor>;
type SoundControls = Pick<
	ReturnType<typeof useBoothSounds>,
	"prepare" | "cancel"
>;
type CameraSession = {
	id: number;
	selected: string;
	constraints: MediaTrackConstraints;
};

export function useBoothCamera({
	store,
	videoRef,
	streamRef,
	compositorRef,
	settingsRef,
	sounds,
	onInterrupted,
}: {
	store: BoothStore;
	videoRef: RefObject<HTMLVideoElement | null>;
	streamRef: RefObject<MediaStream | null>;
	compositorRef: RefObject<Compositor | null>;
	settingsRef: RefObject<Settings>;
	sounds: SoundControls;
	onInterrupted: () => void;
}) {
	const connectionRef = useRef(0);
	const [session, setSession] = useState<CameraSession | null>(null);
	const { prepare: prepareSound, cancel: cancelSound } = sounds;

	useEffect(
		() => () => {
			connectionRef.current += 1;
			streamRef.current = null;
			videoRef.current = null;
			cancelSound();
			onInterrupted();
			store.setState({ connected: false, connecting: false });
		},
		[cancelSound, onInterrupted, store, streamRef, videoRef],
	);

	const onError = useCallback(
		(connection: number, error: unknown) => {
			if (connection !== connectionRef.current) return;
			connectionRef.current += 1;
			cancelSound();
			onInterrupted();
			streamRef.current = null;
			setSession(null);
			const name = error instanceof Error ? error.name : "";
			const explanation =
				name === "NotAllowedError"
					? "Allow camera access in your browser settings, then press Connect. Open this page directly in Safari or Chrome rather than an in-app browser."
					: name === "NotFoundError" || name === "OverconstrainedError"
						? "That camera is unavailable. Try Default camera or another camera. External Cam Link cameras require support from your phone and browser."
						: name === "NotReadableError"
							? "The camera is busy. Close other camera apps or browser tabs, then press Connect."
							: error instanceof Error
								? error.message
								: typeof error === "string"
									? error
									: "Could not connect the camera.";
			store.setState({
				connected: false,
				connecting: false,
				message: `Camera error: ${explanation}`,
			});
		},
		[cancelSound, onInterrupted, store, streamRef],
	);

	const connect = useCallback(
		(selected: string) => {
			if (store.getState().connecting) return;
			void prepareSound();
			const id = ++connectionRef.current;
			streamRef.current = null;
			store.setState({ connecting: true, connected: false, message: "" });
			if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
				onError(
					id,
					new Error(
						"Camera access requires HTTPS or localhost and a supported browser.",
					),
				);
				return;
			}
			const facing =
				selected === "facing:user"
					? "user"
					: selected === "facing:environment"
						? "environment"
						: null;
			setSession({
				id,
				selected,
				constraints: {
					...(facing
						? { facingMode: { exact: facing } }
						: selected
							? { deviceId: { exact: selected } }
							: {}),
					width: { ideal: 1920 },
					height: { ideal: 1080 },
				},
			});
		},
		[onError, prepareSound, store, streamRef],
	);

	const onUserMedia = useCallback(
		async (current: CameraSession, stream: MediaStream) => {
			if (current.id !== connectionRef.current) return;
			streamRef.current = stream;
			try {
				const track = stream.getVideoTracks()[0];
				if (!track)
					throw new Error("The selected camera did not provide a video track.");
				const interrupted = () => {
					if (current.id !== connectionRef.current) return;
					cancelSound();
					onInterrupted();
					store.setState({
						connected: false,
						message:
							"Camera paused or disconnected. Return to this page and press Connect to resume.",
					});
				};
				track.onended = interrupted;
				track.onmute = interrupted;
				track.onunmute = () => {
					if (
						current.id !== connectionRef.current ||
						track.readyState !== "live"
					)
						return;
					store.setState({ connected: true, message: "" });
				};
				const video = videoRef.current;
				if (!video) throw new Error("Could not start the camera preview.");
				await video.play();
				const devices = (
					await navigator.mediaDevices.enumerateDevices()
				).filter((item) => item.kind === "videoinput");
				if (current.id !== connectionRef.current) return;
				compositorRef.current?.draw(video, settingsRef.current);
				const info = track.getSettings();
				store.setState({
					resolution:
						info.width && info.height
							? `${info.width} × ${info.height}`
							: "Resolution unavailable",
					devices,
					deviceId: current.selected.startsWith("facing:")
						? current.selected
						: (info.deviceId ?? current.selected),
					connected: track.readyState === "live" && !track.muted,
					connecting: false,
				});
			} catch (error) {
				onError(current.id, error);
			}
		},
		[
			cancelSound,
			compositorRef,
			onError,
			onInterrupted,
			settingsRef,
			store,
			streamRef,
			videoRef,
		],
	);

	const attachWebcam = useCallback(
		(webcam: Webcam | null) => {
			videoRef.current = webcam?.video ?? null;
		},
		[videoRef],
	);

	return { connect, session, attachWebcam, onUserMedia, onError };
}

export type BoothCamera = ReturnType<typeof useBoothCamera>;
