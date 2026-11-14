"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBoothCamera } from "@/components/booth/hooks/use-booth-camera";
import { useBoothCapture } from "@/components/booth/hooks/use-booth-capture";
import { useBoothPreview } from "@/components/booth/hooks/use-booth-preview";
import {
	type Backdrop,
	createBoothStore,
} from "@/components/booth/store/store";
import { quotaAllowsCapture, useQuota } from "@/lib/queries/account";
import { useBoothSounds } from "@/lib/use-booth-sounds";
import { useVoiceTrigger } from "@/lib/use-voice-trigger";

const useHydrationEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useBoothController(backgrounds: Backdrop[]) {
	const [store] = useState(() => createBoothStore(backgrounds));
	useHydrationEffect(() => {
		void store.persist.rehydrate();
	}, [store]);
	const sounds = useBoothSounds();
	const streamRef = useRef<MediaStream | null>(null);
	const quota = useQuota();
	const { videoRef, canvasRef, compositorRef, settingsRef } =
		useBoothPreview(store);
	const capture = useBoothCapture({
		store,
		canvasRef,
		videoRef,
		compositorRef,
		settingsRef,
		streamRef,
		sounds,
	});
	const camera = useBoothCamera({
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
		camera,
		canvasRef,
		quota,
		canCapture: quotaAllowsCapture(quota.status, quota.data),
		startCountdown: capture.startCountdown,
		connect: camera.connect,
		upload: capture.upload,
		uploadView: capture.uploadView,
		discard: capture.discard,
		save: capture.save,
		retake: capture.retake,
		prepareSound: sounds.prepare,
	};
}
