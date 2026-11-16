"use client";

import {
	Camera,
	Check,
	Download,
	Mic,
	MicOff,
	RotateCcw,
	ScanFace,
	Trash2,
} from "lucide-react";
import { AutoCaptureToast } from "@/components/booth/auto-capture-toast";
import type { UploadView } from "@/components/booth/hooks/use-booth-capture";
import type { BoothState, BoothStore } from "@/components/booth/store/store";
import { Button, buttonVariants } from "@/components/ui/button";
import { STILLNESS_SECONDS } from "@/lib/face-stillness";
import type { useVoiceTrigger } from "@/lib/use-voice-trigger";

export function AutoCaptureButton({
	store,
	enabled,
	isPhotoMode,
}: {
	store: BoothStore;
	enabled: boolean;
	isPhotoMode: boolean;
}) {
	return (
		<Button
			variant={enabled ? "secondary" : "outline"}
			size={isPhotoMode ? "icon-lg" : "default"}
			type="button"
			className={isPhotoMode ? "size-14 cursor-pointer !p-0" : undefined}
			aria-pressed={enabled}
			aria-label="Automatic capture"
			aria-describedby="auto-capture-status"
			title="Automatic capture"
			onClick={() =>
				store.setState((state) => ({
					autoCapture: !state.autoCapture,
					autoCapturePaused: false,
				}))
			}
		>
			<ScanFace data-icon="inline-start" />
			{!isPhotoMode && `Auto capture: ${enabled ? "On" : "Off"}`}
		</Button>
	);
}

export function PreviewActions({
	store,
	photo,
	connected,
	frameReady,
	canCapture,
	capturing,
	isPhotoMode,
	autoCaptureEnabled,
	autoCapture,
	voice,
	upload,
	onCapture,
	onDiscard,
	onSave,
	onRetake,
	onUpload,
	onPrepareSound,
}: {
	store: BoothStore;
	photo: BoothState["photo"];
	connected: boolean;
	frameReady: boolean;
	canCapture: boolean;
	capturing: boolean;
	isPhotoMode: boolean;
	autoCaptureEnabled: boolean;
	autoCapture: { status: string; error: boolean };
	voice: ReturnType<typeof useVoiceTrigger>;
	upload: UploadView;
	onCapture: () => void;
	onDiscard: () => void;
	onSave: () => void;
	onRetake: () => void;
	onUpload: (blob: Blob) => void;
	onPrepareSound: () => void;
}) {
	return (
		<>
			<div
				className={`actions mt-5 flex flex-wrap justify-center gap-2.5 min-[801px]:mt-3 [&_a]:min-h-11.5 [&_a]:rounded-[10px] [&_a]:px-[clamp(8px,2vw,23px)] [&_[data-slot=button]]:min-h-[46px] [&_[data-slot=button]]:rounded-[10px] [&_[data-slot=button]]:px-[clamp(8px,2vw,23px)] ${isPhotoMode ? "absolute right-3 bottom-[max(20px,env(safe-area-inset-bottom))] left-3 z-[2] !m-0" : "relative z-10"}`}
			>
				{!photo ? (
					<Button
						size="lg"
						className="h-14 min-w-0 flex-1 cursor-pointer text-base font-semibold"
						disabled={!connected || !frameReady || !canCapture || capturing}
						onClick={onCapture}
					>
						<Camera data-icon="inline-start" />{" "}
						{capturing ? "Get ready…" : "Take a photo"}
					</Button>
				) : upload.status === "idle" ? (
					<>
						<Button
							size="lg"
							variant="outline"
							className="h-14 cursor-pointer"
							disabled={!connected || !canCapture}
							onClick={onRetake}
						>
							<RotateCcw data-icon="inline-start" /> Retake
						</Button>
						<Button
							size="lg"
							className="h-14 min-w-0 flex-1 cursor-pointer text-base font-semibold"
							onClick={onSave}
						>
							<Check data-icon="inline-start" /> Save photo
						</Button>
					</>
				) : upload.status === "failed" ? (
					<>
						<Button
							size="lg"
							variant="outline"
							onClick={onDiscard}
							className="cursor-pointer"
						>
							<Trash2 data-icon="inline-start" /> Discard photo
						</Button>
						<a
							className={buttonVariants({ variant: "outline", size: "lg" })}
							href={photo.url}
							download="baby-shower.jpg"
						>
							<Download /> Download photo
						</a>
					</>
				) : (
					<Button size="lg" className="h-14 min-w-0 flex-1" disabled>
						Saving…
					</Button>
				)}
				{isPhotoMode && (
					<AutoCaptureButton
						store={store}
						enabled={autoCaptureEnabled}
						isPhotoMode
					/>
				)}
				<Button
					variant={voice.status === "off" ? "outline" : "secondary"}
					size="icon-lg"
					type="button"
					className="size-14 cursor-pointer !p-0"
					aria-pressed={voice.status !== "off"}
					aria-label={
						voice.status === "off"
							? "Enable voice capture"
							: "Stop voice capture"
					}
					aria-describedby="voice-disclosure"
					title={
						voice.status === "off"
							? "Enable voice capture"
							: "Stop voice capture"
					}
					onClick={() => {
						if (voice.status === "off") {
							void onPrepareSound();
							voice.start();
						} else voice.stop();
					}}
				>
					{voice.status === "off" ? <Mic /> : <MicOff />}
				</Button>
			</div>
			<span id="auto-capture-status" className="sr-only">
				Automatic capture starts when a centered face holds still for{" "}
				{STILLNESS_SECONDS} second.
			</span>
			<AutoCaptureToast
				message={
					autoCapture.error ||
					(!capturing &&
						(autoCapture.status === "Waiting for a face." ||
							autoCapture.status.startsWith("Automatic capture paused.") ||
							autoCapture.status.startsWith("Face detected.")))
						? autoCapture.status
						: null
				}
			/>
			<p
				className={
					voice.status === "off"
						? "sr-only"
						: "text-xs leading-[1.5] text-[#8a9faa]"
				}
				role="status"
			>
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
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
					{voice.error}
				</p>
			)}
			{upload.status !== "idle" && (
				<div
					className={
						isPhotoMode
							? "absolute right-3 bottom-24 left-3 z-[2] rounded-xl bg-background/90 p-3 text-center text-xs text-foreground"
							: "mt-[13px] text-center text-xs text-[#6b8c9d]"
					}
				>
					<p role={upload.status === "failed" ? "alert" : "status"}>
						{upload.message}
					</p>
					{upload.status === "failed" && photo && (
						<>
							<p className="text-xs leading-[1.5] text-[#8a9faa]">
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
		</>
	);
}
