"use client";

import {
	Camera,
	Cloud,
	Download,
	Maximize2,
	Mic,
	MicOff,
	PanelRightClose,
	PanelRightOpen,
	RefreshCw,
	X,
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import Webcam from "react-webcam";
import { useStore } from "zustand";
import { BackdropCarousel } from "@/components/booth/backdrop-carousel";
import { CameraControls } from "@/components/booth/camera-controls";
import type { BoothCamera } from "@/components/booth/hooks/use-booth-camera";
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
	camera: BoothCamera;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sounds: ReturnType<typeof useBoothSounds>;
	voice: ReturnType<typeof useVoiceTrigger>;
	onCapture: () => void;
	onRetake: () => void;
	onUpload: (blob: Blob) => void;
	upload: UploadView;
	canCapture: boolean;
	onPrepareSound: () => void;
	settingsVisible: boolean;
	onToggleSettings: () => void;
	onConnect: (deviceId: string) => void;
};

export function BoothPreview({
	store,
	backgrounds,
	backdropError,
	onRetryBackdrops,
	camera: { session, attachWebcam, onUserMedia, onError },
	canvasRef,
	sounds,
	voice,
	onCapture,
	onRetake,
	onUpload,
	upload,
	canCapture,
	onPrepareSound,
	settingsVisible,
	onToggleSettings,
	onConnect,
}: Props) {
	const {
		connected,
		resolution,
		photo,
		countdown,
		message,
		frameReady,
		frameSize,
		frameError,
		settings,
		keyDetected,
	} = useStore(store);
	const [photoMode, setPhotoMode] = useState(false);
	const isPhotoMode = photoMode && !photo;
	const exitPhotoMode = useCallback(() => {
		window.history.back();
		setPhotoMode(false);
	}, []);

	useEffect(() => {
		if (!isPhotoMode) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const exitOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				exitPhotoMode();
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
	}, [exitPhotoMode, isPhotoMode]);
	const enterPhotoMode = () => {
		const state =
			window.history.state && typeof window.history.state === "object"
				? { ...window.history.state, photoBoothMode: true }
				: { photoBoothMode: true };
		window.history.pushState(state, "", window.location.href);
		setPhotoMode(true);
	};

	const frameStyle: CSSProperties & { "--frame-aspect": number } = {
		"--frame-aspect": frameSize ? frameSize.width / frameSize.height : 16 / 9,
	};

	return (
		<section
			className={`preview-card booth-preview min-w-0 border-0 bg-transparent p-0 [box-shadow:none] ${isPhotoMode ? "is-photo-mode absolute inset-0 z-[1] block h-full w-full" : "[@media(min-width:801px)_and_(min-height:600px)]:flex [@media(min-width:801px)_and_(min-height:600px)]:h-full [@media(min-width:801px)_and_(min-height:600px)]:flex-col [@media(min-width:801px)_and_(min-height:600px)]:overflow-y-auto [@media(min-width:801px)_and_(min-height:600px)]:[&>*]:shrink-0"}`}
		>
			<div
				className={
					isPhotoMode
						? "contents"
						: "min-w-0 [@media(min-width:801px)_and_(min-height:600px)]:flex [@media(min-width:801px)_and_(min-height:600px)]:min-h-0 [@media(min-width:801px)_and_(min-height:600px)]:flex-1 [@media(min-width:801px)_and_(min-height:600px)]:items-stretch [@media(min-width:801px)_and_(min-height:600px)]:gap-4"
				}
			>
				<div
					className={`preview-stage ${isPhotoMode ? "" : "[@media(min-width:801px)_and_(min-height:600px)]:grid [@media(min-width:801px)_and_(min-height:600px)]:min-h-[160px] [@media(min-width:801px)_and_(min-height:600px)]:min-w-0 [@media(min-width:801px)_and_(min-height:600px)]:flex-[1_1_0] [@media(min-width:801px)_and_(min-height:600px)]:place-items-center [@media(min-width:801px)_and_(min-height:600px)]:[container-type:size]"}`}
					style={frameStyle}
				>
					<div
						className={`preview-frame ${isPhotoMode ? "" : "[@media(min-width:801px)_and_(min-height:600px)]:w-[min(100cqw,calc((100cqh_-_80px)*var(--frame-aspect)))]"}`}
					>
						<div
							className={`preview-heading mb-[18px] flex items-center justify-between gap-[15px] min-[801px]:mb-2.5 [@media(min-width:801px)_and_(min-height:600px)]:flex-wrap ${isPhotoMode ? "hidden" : ""}`}
						>
							<div>
								<h2 className="text-[16px] font-bold text-[#365e74]">
									Your photo booth
								</h2>
								<p className="mt-[5px] text-xs text-[#89a1af]">
									{connected
										? `Camera connected · ${resolution}`
										: "Connect a camera to get started"}
								</p>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-2">
								<CameraControls
									store={store}
									onConnect={onConnect}
									id="toolbar-camera"
									accessibleName="Camera device"
									className="hidden w-[250px] min-w-[220px] items-center gap-[7px] min-[801px]:flex"
								/>
								<Button
									className="min-h-[34px] border-[#dceaf2] bg-white px-2.5 text-[#558eae] hover:!bg-[#e8f5fb] hover:!text-[#345d76] [&_svg]:size-[15px]"
									variant="outline"
									disabled={!connected || photo !== null}
									onClick={enterPhotoMode}
								>
									<Maximize2 /> Photo mode
								</Button>
								<Button
									className="hidden min-h-[34px] border-[#dceaf2] bg-white px-2.5 text-[#558eae] hover:!bg-[#e8f5fb] hover:!text-[#345d76] min-[801px]:inline-flex [&_svg]:size-[15px]"
									variant="outline"
									type="button"
									aria-expanded={settingsVisible}
									aria-controls="booth-settings-panel"
									onClick={onToggleSettings}
								>
									{settingsVisible ? <PanelRightClose /> : <PanelRightOpen />}
									{settingsVisible ? "Hide settings" : "Show settings"}
								</Button>
								<span
									className={`rounded-[20px] px-[9px] py-[5px] text-[10px] font-bold tracking-[.1em] ${connected ? "bg-[#e8f6ee] text-[#529578]" : "bg-[#eff5f8] text-[#90a5b1]"}`}
								>
									{connected ? "LIVE" : "OFFLINE"}
								</span>
							</div>
						</div>
						<div
							className={`preview overflow-hidden ${isPhotoMode ? "absolute inset-0 h-full w-full !aspect-auto rounded-none bg-black" : "relative aspect-video rounded-xl bg-[#e9f4f9]"}`}
							style={{
								aspectRatio: frameSize
									? `${frameSize.width} / ${frameSize.height}`
									: "16 / 9",
							}}
						>
							{session && (
								<Webcam
									key={session.id}
									ref={attachWebcam}
									audio={false}
									videoConstraints={session.constraints}
									onUserMedia={(stream) => {
										void onUserMedia(session, stream);
									}}
									onUserMediaError={(error) => {
										onError(session.id, error);
									}}
									className="pointer-events-none absolute size-px opacity-0"
									aria-hidden="true"
									tabIndex={-1}
								/>
							)}
							<canvas
								className="block h-full w-full object-contain"
								ref={canvasRef}
								aria-label="Live photo booth preview"
							/>
							{isPhotoMode && (
								<Button
									className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 z-[3] size-11 rounded-full border border-white/40 bg-black/50 p-0 text-white hover:bg-black/90 hover:text-white [&_svg]:size-5"
									variant="ghost"
									size="icon-lg"
									aria-label="Close photo mode"
									onClick={exitPhotoMode}
								>
									<X />
								</Button>
							)}
							{!connected && !photo && (
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-[#8eb3c6]">
									<Camera size={44} />
									<strong className="font-[Georgia,serif] text-[21px] font-normal text-[#668da2]">
										Your moment awaits
									</strong>
									<span className="text-[13px]">
										Connect your camera to see the magic.
									</span>
								</div>
							)}
							{photo && (
								<Image
									className="absolute inset-0 h-full w-full bg-[#e9f4f9] object-contain"
									src={photo.url}
									alt="A moment at the baby shower"
									fill
									unoptimized
								/>
							)}
							{countdown !== null && (
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-[100px] font-bold text-white [text-shadow:0_2px_20px_#0008]">
									{countdown}
								</div>
							)}
						</div>
					</div>
				</div>
				<BackdropCarousel store={store} backgrounds={backgrounds} />
			</div>
			{connected && !photo && settings.greenScreen && keyDetected === false && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="status"
				>
					The camera can&apos;t see the green key color, so green areas
					won&apos;t be replaced. Stand in front of a green screen, or adjust
					the key color under Green screen settings.
				</p>
			)}
			{backdropError && (
				<>
					<p
						className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
						role="alert"
					>
						{backdropError}
					</p>
					<Button variant="outline" onClick={onRetryBackdrops}>
						Retry backdrops
					</Button>
				</>
			)}
			{message && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
					{message}
				</p>
			)}
			{frameError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
					{frameError}
				</p>
			)}
			{sounds.error && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
					role="alert"
				>
					{sounds.error}
				</p>
			)}
			<div
				className={`actions mt-5 flex flex-wrap justify-center gap-2.5 min-[801px]:mt-3 [&_a]:min-h-[46px] [&_a]:rounded-[10px] [&_a]:px-[clamp(8px,2vw,23px)] [&_[data-slot=button]]:min-h-[46px] [&_[data-slot=button]]:rounded-[10px] [&_[data-slot=button]]:px-[clamp(8px,2vw,23px)] ${isPhotoMode ? "absolute right-3 bottom-[max(20px,env(safe-area-inset-bottom))] left-3 z-[2] !m-0" : ""}`}
			>
				{!photo ? (
					<Button
						className="border-[#568eae] bg-[#568eae] font-semibold text-white shadow-[0_4px_12px_#568eae30] hover:border-[#417b9b] hover:bg-[#417b9b]"
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
					className={`border border-dashed border-[#afc8d6] bg-[#f0f7fb] text-[#648193] shadow-none hover:bg-[#e4f0f7] hover:text-[#345d76] ${voice.status === "off" ? "" : "border-solid border-[#82bda0] bg-[#e5f4ed] text-[#38795c] shadow-[0_0_0_3px_#82bda01a] hover:bg-[#d7eddf] hover:text-[#345d76]"}`}
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
			{photo && (
				<div className="mt-[13px] text-center text-xs text-[#6b8c9d]">
					<p role={upload.status === "failed" ? "alert" : "status"}>
						{upload.message}
					</p>
					{upload.status === "failed" && (
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
		</section>
	);
}
