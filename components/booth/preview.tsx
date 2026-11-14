"use client";

import {
	Camera,
	Check,
	Cloud,
	Download,
	FlipHorizontal2,
	Maximize2,
	Mic,
	MicOff,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import Image from "next/image";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";
import Webcam from "react-webcam";
import { useStore } from "zustand";
import { CameraControls } from "@/components/booth/camera-controls";
import type { BoothCamera } from "@/components/booth/hooks/use-booth-camera";
import type { UploadView } from "@/components/booth/hooks/use-booth-capture";
import type { BoothStore } from "@/components/booth/store/store";
import { Button, buttonVariants } from "@/components/ui/button";
import type { useBoothSounds } from "@/lib/use-booth-sounds";
import type { useVoiceTrigger } from "@/lib/use-voice-trigger";
import { Badge } from "../ui/badge";

type Props = {
	store: BoothStore;
	backdropError?: string;
	onRetryBackdrops: () => void;
	camera: BoothCamera;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sounds: ReturnType<typeof useBoothSounds>;
	voice: ReturnType<typeof useVoiceTrigger>;
	onCapture: () => void;
	onDiscard: () => void;
	onSave: () => void;
	onRetake: () => void;
	onUpload: (blob: Blob) => void;
	upload: UploadView;
	canCapture: boolean;
	onPrepareSound: () => void;
	onConnect: (deviceId: string) => void;
	menu: ReactNode;
};

export function BoothPreview({
	store,
	backdropError,
	onRetryBackdrops,
	camera: { session, attachWebcam, onUserMedia, onError },
	canvasRef,
	sounds,
	voice,
	onCapture,
	onDiscard,
	onSave,
	onRetake,
	onUpload,
	upload,
	canCapture,
	onPrepareSound,
	onConnect,
	menu,
}: Props) {
	const {
		connected,
		resolution,
		photo,
		countdown,
		message,
		frameReady,
		frameSize,
		frameOpenings,
		shotIndex,
		frameError,
		settings,
		keyDetected,
	} = useStore(store);
	const capturing = countdown !== null || shotIndex !== null;
	const shotTotal = Math.max(1, frameOpenings.length);
	const activeOpening =
		shotIndex !== null ? frameOpenings[shotIndex] : undefined;
	const [photoMode, setPhotoMode] = useState(false);
	const isPhotoMode = photoMode;
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
			className={`preview-card booth-preview min-w-0 border-0 bg-transparent p-0
				 [box-shadow:none] ${
						isPhotoMode
							? "is-photo-mode absolute inset-0 z-1 block h-full w-full"
							: "[@media(min-width:801px)_and_(min-height:600px)]:flex [@media(min-width:801px)_and_(min-height:600px)]:h-full [@media(min-width:801px)_and_(min-height:600px)]:flex-col [@media(min-width:801px)_and_(min-height:600px)]:overflow-y-auto [@media(min-width:801px)_and_(min-height:600px)]:*:shrink-0"
					}`}
		>
			<div
				className={
					isPhotoMode
						? "contents"
						: "min-w-0 [@media(min-width:801px)_and_(min-height:600px)]:flex [@media(min-width:801px)_and_(min-height:600px)]:min-h-0 [@media(min-width:801px)_and_(min-height:600px)]:flex-1 [@media(min-width:801px)_and_(min-height:600px)]:items-stretch [@media(min-width:801px)_and_(min-height:600px)]:gap-4"
				}
			>
				<div
					className={`preview-stage ${
						isPhotoMode
							? ""
							: "[@media(min-width:801px)_and_(min-height:600px)]:grid [@media(min-width:801px)_and_(min-height:600px)]:min-h-40 [@media(min-width:801px)_and_(min-height:600px)]:min-w-0 [@media(min-width:801px)_and_(min-height:600px)]:flex-[1_1_0] [@media(min-width:801px)_and_(min-height:600px)]:place-items-center [@media(min-width:801px)_and_(min-height:600px)]:@container-size"
					}`}
					style={frameStyle}
				>
					<div
						className={`preview-frame ${isPhotoMode ? "" : "[@media(min-width:801px)_and_(min-height:600px)]:w-[min(100cqw,calc((100cqh-80px)*var(--frame-aspect)))]"}`}
					>
						<div
							className={`preview-heading mb-4.5 flex flex-wrap items-center justify-between gap-3.75 min-[801px]:mb-2.5 [@media(min-width:801px)_and_(min-height:600px)]:flex-wrap ${isPhotoMode ? "hidden" : ""}`}
						>
							<div className="flex flex-col">
								<div className="flex items-center gap-2">
									<Cloud size={16} className="text-blue-500" />
									<h2 className="text-lg">Baby Nugget Photo Booth</h2>
									<Badge
										className={`${connected ? "bg-green-100 text-green-800" : ""} h-full`}
									>
										{connected ? "LIVE" : "OFFLINE"}
									</Badge>
								</div>

								<p className="mt-1.25 text-xs text-[#89a1af]">
									{connected
										? `Camera connected · ${resolution}`
										: "Connect a camera to get started"}
								</p>
							</div>
							<div className="flex w-full flex-wrap items-center justify-end gap-2 min-[801px]:w-auto">
								<CameraControls
									store={store}
									onConnect={onConnect}
									id="toolbar-camera"
									accessibleName="Camera device"
									className="flex w-full min-w-0 items-center gap-1.75 min-[801px]:w-62.5 min-[801px]:min-w-55"
								/>
								<Button
									variant={settings.mirror ? "secondary" : "outline"}
									aria-pressed={settings.mirror}
									disabled={capturing || photo !== null}
									onClick={() =>
										store.setState((state) => ({
											settings: {
												...state.settings,
												mirror: !state.settings.mirror,
											},
										}))
									}
								>
									<FlipHorizontal2 data-icon="inline-start" /> Mirror
								</Button>
								<Button
									variant="outline"
									disabled={!connected || photo !== null}
									onClick={enterPhotoMode}
								>
									<Maximize2 /> Photo mode
								</Button>
								{menu}
							</div>
						</div>
						<div
							className={`preview overflow-hidden shadow-[0_14px_40px_-14px_rgba(99,165,200,0.62),0_8px_24px_-12px_rgba(228,156,182,0.48)]
								 ${
										isPhotoMode
											? "absolute inset-0 h-full w-full aspect-auto! rounded-none bg-black"
											: "relative aspect-video rounded-xl bg-[#e9f4f9]"
									}`}
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
									onUserMedia={(stream: MediaStream) => {
										void onUserMedia(session, stream);
									}}
									onUserMediaError={(error: unknown) => {
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
							{capturing && !photo && (
								// Matches the canvas's contained frame so the countdown sits on
								// the active box, including in letterboxed photo mode.
								<div className="pointer-events-none absolute inset-0 grid place-items-center @container-size">
									<div
										className="relative w-[min(100cqw,calc(100cqh*var(--frame-aspect)))]"
										style={{
											aspectRatio: frameSize
												? `${frameSize.width} / ${frameSize.height}`
												: "16 / 9",
										}}
									>
										<div
											className="absolute flex flex-col items-center justify-center gap-2.5 font-bold text-white [text-shadow:0_2px_20px_#0008]"
											style={
												activeOpening
													? {
															left: `${activeOpening.x * 100}%`,
															top: `${activeOpening.y * 100}%`,
															width: `${activeOpening.width * 100}%`,
															height: `${activeOpening.height * 100}%`,
														}
													: { inset: 0 }
											}
										>
											{countdown !== null && (
												<span className="text-[clamp(56px,9cqw,100px)] leading-none">
													{countdown}
												</span>
											)}
											{shotTotal > 1 && shotIndex !== null && (
												<span
													className="rounded-full bg-black/45 px-3 py-1 text-sm font-semibold [text-shadow:none]"
													role="status"
												>
													Photo {shotIndex + 1} of {shotTotal}
												</span>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			{connected && !photo && settings.greenScreen && keyDetected === false && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="status"
				>
					The camera can&apos;t see the green key color, so green areas
					won&apos;t be replaced. Stand in front of a green screen that matches
					the saved key color.
				</p>
			)}
			{backdropError && (
				<>
					<p
						className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
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
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{message}
				</p>
			)}
			{frameError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{frameError}
				</p>
			)}
			{sounds.error && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{sounds.error}
				</p>
			)}
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
		</section>
	);
}
