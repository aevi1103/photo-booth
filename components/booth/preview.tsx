"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { BoothCamera } from "@/components/booth/hooks/use-booth-camera";
import type { UploadView } from "@/components/booth/hooks/use-booth-capture";
import { PreviewActions } from "@/components/booth/preview-actions";
import { PreviewAlerts } from "@/components/booth/preview-alerts";
import { PreviewStage } from "@/components/booth/preview-stage";
import type { BoothStore } from "@/components/booth/store/store";
import type { useBoothSounds } from "@/lib/use-booth-sounds";
import type { useVoiceTrigger } from "@/lib/use-voice-trigger";

type Props = {
	store: BoothStore;
	backdropError?: string;
	onRetryBackdrops: () => void;
	camera: BoothCamera;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sounds: ReturnType<typeof useBoothSounds>;
	voice: ReturnType<typeof useVoiceTrigger>;
	autoCapture: { status: string; error: boolean };
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
	camera,
	canvasRef,
	sounds,
	voice,
	autoCapture,
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
		autoCapture: autoCaptureEnabled,
	} = useStore(store);
	const capturing = countdown !== null || shotIndex !== null;
	const [isPhotoMode, setPhotoMode] = useState(false);
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
				<PreviewStage
					store={store}
					camera={camera}
					canvasRef={canvasRef}
					connected={connected}
					resolution={resolution}
					photo={photo}
					countdown={countdown}
					frameSize={frameSize}
					frameOpenings={frameOpenings}
					shotIndex={shotIndex}
					settings={settings}
					capturing={capturing}
					autoCaptureEnabled={autoCaptureEnabled}
					isPhotoMode={isPhotoMode}
					frameStyle={frameStyle}
					onConnect={onConnect}
					onEnterPhotoMode={enterPhotoMode}
					onExitPhotoMode={exitPhotoMode}
					menu={menu}
				/>
			</div>
			<PreviewAlerts
				connected={connected}
				photo={photo}
				settings={settings}
				keyDetected={keyDetected}
				backdropError={backdropError}
				message={message}
				frameError={frameError}
				soundError={sounds.error}
				onRetryBackdrops={onRetryBackdrops}
			/>
			<PreviewActions
				store={store}
				photo={photo}
				connected={connected}
				frameReady={frameReady}
				canCapture={canCapture}
				capturing={capturing}
				isPhotoMode={isPhotoMode}
				autoCaptureEnabled={autoCaptureEnabled}
				autoCapture={autoCapture}
				voice={voice}
				upload={upload}
				onCapture={onCapture}
				onDiscard={onDiscard}
				onSave={onSave}
				onRetake={onRetake}
				onUpload={onUpload}
				onPrepareSound={onPrepareSound}
			/>
		</section>
	);
}
