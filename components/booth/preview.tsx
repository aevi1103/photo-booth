"use client";

import { Camera, Cloud, Download, Mic, MicOff, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { Button, buttonVariants } from "@/components/ui/button";
import type { useBoothSounds } from "@/lib/use-booth-sounds";
import type { useVoiceTrigger } from "@/lib/use-voice-trigger";

type Props = {
	store: BoothStore;
	videoRef: React.RefObject<HTMLVideoElement | null>;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sounds: ReturnType<typeof useBoothSounds>;
	voice: ReturnType<typeof useVoiceTrigger>;
	onCapture: () => void;
	onRetake: () => void;
	onUpload: (blob: Blob) => void;
	onPrepareSound: () => void;
};

export function BoothPreview({
	store,
	videoRef,
	canvasRef,
	sounds,
	voice,
	onCapture,
	onRetake,
	onUpload,
	onPrepareSound,
}: Props) {
	const {
		connected,
		resolution,
		photo,
		countdown,
		message,
		uploadStatus,
		uploadState,
		frameReady,
		quota,
	} = useStore(store);

	return (
		<section className="preview-card booth-preview">
			<div className="preview-heading">
				<div>
					<h2>Your photo booth</h2>
					<p>
						{connected
							? `Camera connected · ${resolution}`
							: "Connect a camera to get started"}
					</p>
				</div>
				<span className={connected ? "status on" : "status"}>
					{connected ? "LIVE" : "OFFLINE"}
				</span>
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
							!connected ||
							!frameReady ||
							!quota ||
							quota.remaining === 0 ||
							countdown !== null
						}
						onClick={onCapture}
					>
						<Cloud /> {countdown !== null ? "Get ready…" : "Take a photo"}
					</Button>
				) : (
					<>
						<Button
							size="lg"
							disabled={uploadStatus === "saving"}
							onClick={onRetake}
						>
							<RefreshCw /> Retake
						</Button>
						{uploadStatus === "failed" && (
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
			<p className="sr-only" role="status">
				{voice.status === "listening"
					? "Listening for “capture”"
					: voice.status === "starting"
						? "Starting voice recognition…"
						: voice.status === "reconnecting"
							? "Speech service connection failed. Retrying…"
							: "Voice control is off."}
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
					<p role={uploadStatus === "failed" ? "alert" : "status"}>
						{uploadState}
					</p>
					{uploadStatus === "failed" && (
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
