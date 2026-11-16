"use client";

import { Camera, Cloud, FlipHorizontal2, Maximize2, X } from "lucide-react";
import Image from "next/image";
import type { CSSProperties, ReactNode, RefObject } from "react";
import Webcam from "react-webcam";
import { CameraControls } from "@/components/booth/camera-controls";
import type { BoothCamera } from "@/components/booth/hooks/use-booth-camera";
import { AutoCaptureButton } from "@/components/booth/preview-actions";
import type { BoothState, BoothStore } from "@/components/booth/store/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Opening } from "@/lib/frame-geometry";

export function PreviewStage({
	store,
	camera: { session, attachWebcam, onUserMedia, onError },
	canvasRef,
	connected,
	resolution,
	photo,
	countdown,
	frameSize,
	frameOpenings,
	shotIndex,
	settings,
	capturing,
	autoCaptureEnabled,
	isPhotoMode,
	frameStyle,
	onConnect,
	onEnterPhotoMode,
	onExitPhotoMode,
	menu,
}: {
	store: BoothStore;
	camera: BoothCamera;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	connected: boolean;
	resolution: string;
	photo: BoothState["photo"];
	countdown: number | null;
	frameSize: BoothState["frameSize"];
	frameOpenings: Opening[];
	shotIndex: number | null;
	settings: BoothState["settings"];
	capturing: boolean;
	autoCaptureEnabled: boolean;
	isPhotoMode: boolean;
	frameStyle: CSSProperties & { "--frame-aspect": number };
	onConnect: (deviceId: string) => void;
	onEnterPhotoMode: () => void;
	onExitPhotoMode: () => void;
	menu: ReactNode;
}) {
	const shotTotal = Math.max(1, frameOpenings.length);
	const activeOpening =
		shotIndex !== null ? frameOpenings[shotIndex] : undefined;

	return (
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
						{!isPhotoMode && (
							<AutoCaptureButton
								store={store}
								enabled={autoCaptureEnabled}
								isPhotoMode={false}
							/>
						)}
						<Button
							variant="outline"
							disabled={!connected || photo !== null}
							onClick={onEnterPhotoMode}
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
							className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 z-3 size-11 rounded-full border border-white/40 bg-black/50 p-0 text-white hover:bg-black/90 hover:text-white [&_svg]:size-5"
							variant="ghost"
							size="icon-lg"
							aria-label="Close photo mode"
							onClick={onExitPhotoMode}
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
					{/* Align the countdown with the contained frame in letterboxed photo mode. */}
					{capturing && !photo && (
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
											className="rounded-full bg-black/45 px-3 py-1 text-sm font-semibold text-shadow-none"
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
	);
}
