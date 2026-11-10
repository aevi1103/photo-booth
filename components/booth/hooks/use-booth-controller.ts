"use client";

import { useRef, useState } from "react";
import { useBoothCamera } from "@/components/booth/hooks/use-booth-camera";
import { useBoothCapture } from "@/components/booth/hooks/use-booth-capture";
import { useBoothPreview } from "@/components/booth/hooks/use-booth-preview";
import { useBoothQuota } from "@/components/booth/hooks/use-booth-quota";
import {
	type Backdrop,
	createBoothStore,
} from "@/components/booth/store/store";
import { useBoothSounds } from "@/lib/use-booth-sounds";
import { useVoiceTrigger } from "@/lib/use-voice-trigger";

export function useBoothController(backgrounds: Backdrop[]) {
	const [store] = useState(() => createBoothStore(backgrounds));
	const sounds = useBoothSounds();
	const streamRef = useRef<MediaStream | null>(null);
	const { quota, quotaError, refreshQuota } = useBoothQuota(store);
	const { videoRef, canvasRef, compositorRef, settingsRef } =
		useBoothPreview(store);
	const capture = useBoothCapture({
		store,
		canvasRef,
		streamRef,
		sounds,
		refreshQuota,
	});
	const { connect } = useBoothCamera({
		store,
		videoRef,
		streamRef,
		compositorRef,
		settingsRef,
		sounds,
		onInterrupted: capture.handleCameraInterruption,
	});
	const voice = useVoiceTrigger(capture.startCountdown);

	return {
		store,
		sounds,
		voice,
		videoRef,
		canvasRef,
		quota,
		quotaError,
		refreshQuota,
		startCountdown: capture.startCountdown,
		connect,
		upload: capture.upload,
		retake: capture.retake,
		prepareSound: sounds.prepare,
	};
}
