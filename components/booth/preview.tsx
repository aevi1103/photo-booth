"use client";

import {
	Camera,
	Cloud,
	Download,
	Maximize2,
	Mic,
	MicOff,
	RefreshCw,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { BackdropCarousel } from "@/components/booth/backdrop-carousel";
import type { UploadView } from "@/components/booth/hooks/use-booth-capture";
import type { Backdrop, BoothStore } from "@/components/booth/store/store";
import { Button, buttonVariants } from "@/components/ui/button";
import type { useBoothSounds } from "@/lib/use-booth-sounds";
import type { useVoiceTrigger } from "@/lib/use-voice-trigger";

type Props = {
	store: BoothStore;
	backgrounds: Backdrop[];
	backdropError?: string;
	onRetryBackdrops: () => void;
	videoRef: React.RefObject<HTMLVideoElement | null>;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sounds: ReturnType<typeof useBoothSounds>;
	voice: ReturnType<typeof useVoiceTrigger>;
	onCapture: () => void;
	onRetake: () => void;
	onUpload: (blob: Blob) => void;
	upload: UploadView;
	canCapture: boolean;
	onPrepareSound: () => void;
};

export function BoothPreview({
	store,
	backgrounds,
	backdropError,
	onRetryBackdrops,
	videoRef,
	canvasRef,
	sounds,
	voice,
	onCapture,
	onRetake,
	onUpload,
	upload,
	canCapture,
	onPrepareSound,
}: Props) {
	const {
		connected,
		resolution,
		photo,
		countdown,
		message,
		frameReady,
		settings,
		keyDetected,
	} = useStore(store);
	const [photoMode, setPhotoMode] = useState(false);
	const isPhotoMode = photoMode && !photo;

	useEffect(() => {
		if (!isPhotoMode) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const exitOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				window.history.back();
				setPhotoMode(false);
			}
		};
		const exitOnBack = () => setPhotoMode(false);
		window.addEventListener("keydown", exitOnEscape);
		window.addEventListener("popstate", exitOnBack);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", exitOnEscape);
			window.removeEventListener("popstate", exitOnBack);
		};
	}, [isPhotoMode]);
	const enterPhotoMode = () => {
		const state =
			window.history.state && typeof window.history.state === "object"
				? { ...window.history.state, photoBoothMode: true }
				: { photoBoothMode: true };
		window.history.pushState(state, "", window.location.href);
		setPhotoMode(true);
	};

	return (
		<section
			className={`preview-card booth-preview${isPhotoMode ? " is-photo-mode" : ""}`}
		>
			<div className="preview-heading">
				<div>
					<h2>Your photo booth</h2>
					<p>
						{connected
							? `Camera connected · ${resolution}`
							: "Connect a camera to get started"}
					</p>
				</div>
				<div className="preview-tools">
					<Button
						className="photo-mode-button"
						variant="outline"
						disabled={!connected || photo !== null}
						onClick={enterPhotoMode}
					>
						<Maximize2 /> Photo mode
					</Button>
					<span className={connected ? "status on" : "status"}>
						{connected ? "LIVE" : "OFFLINE"}
					</span>
				</div>
			</div>
			<div className="preview" style={{ aspectRatio: "1153 / 768" }}>
				<video
					ref={videoRef}
					playsInline
					muted
					autoPlay
					className="camera-source"
					aria-hidden="true"
					tabIndex={-1}
				/>
				<canvas ref={canvasRef} aria-label="Live photo booth preview" />
				{!connected && !photo && (
					<div className="preview-placeholder">
						<Camera size={44} />
						<strong>Your moment awaits</strong>
						<span>Connect your camera to see the magic.</span>
					</div>
				)}
				{photo && (
					<Image
						className="captured"
						src={photo.url}
						alt="A moment at the baby shower"
						fill
						unoptimized
					/>
				)}
				{countdown !== null && <div className="countdown">{countdown}</div>}
			</div>
			<BackdropCarousel store={store} backgrounds={backgrounds} />
			{connected && !photo && settings.greenScreen && keyDetected === false && (
				<p className="notice" role="status">
					The camera can&apos;t see the green key color, so green areas
					won&apos;t be replaced. Stand in front of a green screen, or adjust
					the key color under Green screen settings.
				</p>
			)}
			{backdropError && (
				<>
					<p className="notice" role="alert">
						{backdropError}
					</p>
					<Button variant="outline" onClick={onRetryBackdrops}>
						Retry backdrops
					</Button>
				</>
			)}
			{message && (
				<p className="notice" role="alert">
					{message}
				</p>
			)}
			{sounds.error && (
				<p className="notice" role="alert">
					{sounds.error}
				</p>
			)}
			<div className="actions">
				{!photo ? (
					<Button
						className="capture-button"
						size="lg"
						disabled={
							!connected || !frameReady || !canCapture || countdown !== null
						}
						onClick={onCapture}
					>
						<Cloud /> {countdown !== null ? "Get ready…" : "Take a photo"}
					</Button>
				) : (
					<>
						<Button
							size="lg"
							disabled={upload.status === "saving"}
							onClick={() => {
								setPhotoMode(false);
								onRetake();
							}}
						>
							<RefreshCw /> Retake
						</Button>
						{upload.status === "failed" && (
							<a
								className={buttonVariants({ variant: "outline", size: "lg" })}
								href={photo.url}
								download="baby-shower.jpg"
							>
								<Download /> Download photo
							</a>
						)}
					</>
				)}
				<Button
					className={`voice-button${voice.status === "off" ? "" : " is-active"}`}
					variant="outline"
					size="lg"
					type="button"
					aria-pressed={voice.status !== "off"}
					aria-describedby="voice-disclosure"
					title="Say capture to start the countdown. Microphone audio may be sent to your browser's speech service."
					onClick={() => {
						if (voice.status === "off") {
							void onPrepareSound();
							voice.start();
						} else voice.stop();
					}}
				>
					{voice.status === "off" ? <Mic /> : <MicOff />}
					{voice.status === "off"
						? "Enable voice capture"
						: "Stop voice capture"}
				</Button>
			</div>
			<p className={voice.status === "off" ? "sr-only" : "small"} role="status">
				{voice.status === "listening"
					? "Listening for “capture”"
					: voice.status === "starting"
						? "Starting voice recognition…"
						: voice.status === "reconnecting"
							? "Speech service connection failed. Retrying…"
							: "Voice control is off."}
				{voice.status !== "off" && voice.transcript && (
					<> · Heard: “{voice.transcript}”</>
				)}
			</p>
			<p className="sr-only" id="voice-disclosure">
				Say capture to start the countdown. Microphone audio may be sent to your
				browser&apos;s speech service.
			</p>
			{voice.error && (
				<p className="notice" role="alert">
					{voice.error}
				</p>
			)}
			{photo && (
				<div className="upload-result">
					<p role={upload.status === "failed" ? "alert" : "status"}>
						{upload.message}
					</p>
					{upload.status === "failed" && (
						<>
							<p className="small">
								Download this photo as a backup, or retry saving before taking
								another photo.
							</p>
							<Button
								variant="outline"
								onClick={() => void onUpload(photo.blob)}
							>
								Retry saving
							</Button>
						</>
					)}
				</div>
			)}
		</section>
	);
}
