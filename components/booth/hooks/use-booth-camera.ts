"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { BoothStore, Settings } from "@/components/booth/store/store";
import type { createCompositor } from "@/lib/compositor";
import type { useBoothSounds } from "@/lib/use-booth-sounds";

type Compositor = ReturnType<typeof createCompositor>;
type SoundControls = Pick<
	ReturnType<typeof useBoothSounds>,
	"prepare" | "cancel"
>;

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
	const connectingRef = useRef(false);
	const { prepare: prepareSound, cancel: cancelSound } = sounds;

	useEffect(
		() => () => {
			connectionRef.current += 1;
			streamRef.current?.getTracks().forEach((track) => {
				track.stop();
			});
		},
		[streamRef],
	);

	const connect = useCallback(
		async (selected: string) => {
			if (connectingRef.current) return;
			connectingRef.current = true;
			void prepareSound();
			const connection = ++connectionRef.current;
			store.setState({ connecting: true, message: "", connected: false });
			try {
				if (!navigator.mediaDevices?.getUserMedia)
					throw new Error(
						"Camera access requires HTTPS or localhost and a supported browser.",
					);
				streamRef.current?.getTracks().forEach((track) => {
					track.stop();
				});
				const facing =
					selected === "facing:user"
						? "user"
						: selected === "facing:environment"
							? "environment"
							: null;
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						...(facing
							? { facingMode: { exact: facing } }
							: selected
								? { deviceId: { exact: selected } }
								: {}),
						width: { ideal: 1920 },
						height: { ideal: 1080 },
					},
				});
				if (connection !== connectionRef.current) {
					stream.getTracks().forEach((track) => {
						track.stop();
					});
					return;
				}
				streamRef.current = stream;
				const track = stream.getVideoTracks()[0];
				if (!track)
					throw new Error("The selected camera did not provide a video track.");
				const interrupted = () => {
					if (streamRef.current !== stream) return;
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
					if (streamRef.current !== stream || track.readyState !== "live")
						return;
					store.setState({ connected: true, message: "" });
				};
				if (!videoRef.current) {
					stream.getTracks().forEach((item) => {
						item.stop();
					});
					return;
				}
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
				if (connection !== connectionRef.current) {
					stream.getTracks().forEach((item) => {
						item.stop();
					});
					return;
				}
				compositorRef.current?.draw(videoRef.current, settingsRef.current);
				const info = track.getSettings();
				const devices = (
					await navigator.mediaDevices.enumerateDevices()
				).filter((item) => item.kind === "videoinput");
				store.setState({
					resolution:
						info.width && info.height
							? `${info.width} × ${info.height}`
							: "Resolution unavailable",
					devices,
					deviceId: facing ? selected : (info.deviceId ?? selected),
					connected: true,
				});
			} catch (error) {
				if (connection !== connectionRef.current) return;
				streamRef.current?.getTracks().forEach((track) => {
					track.stop();
				});
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
									: "Could not connect the camera.";
				store.setState({ message: `Camera error: ${explanation}` });
			} finally {
				connectingRef.current = false;
				if (connection === connectionRef.current)
					store.setState({ connecting: false });
			}
		},
		[
			cancelSound,
			compositorRef,
			onInterrupted,
			prepareSound,
			settingsRef,
			store,
			streamRef,
			videoRef,
		],
	);

	return { connect };
}
