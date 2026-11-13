import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

export type { Backdrop } from "@/lib/backdrops";

import type { Backdrop } from "@/lib/backdrops";
import type { FrameSize } from "@/lib/frame-geometry";
export type Photo = { url: string; blob: Blob };
export type Settings = {
	color: string;
	threshold: number;
	softness: number;
	mirror: boolean;
	greenScreen: boolean;
};

export const initialSettings: Settings = {
	color: "#00a000",
	threshold: 0.25,
	softness: 0.2,
	mirror: true,
	greenScreen: false,
};

export type BoothState = {
	settings: Settings;
	galleryVisible: boolean;
	devices: MediaDeviceInfo[];
	deviceId: string;
	background: string;
	backgroundChosen: boolean;
	keyDetected: boolean | null;
	frameReady: boolean;
	frameSize: FrameSize | null;
	frameError: string;
	connected: boolean;
	connecting: boolean;
	resolution: string;
	message: string;
	countdown: number | null;
	photo: Photo | null;
};

type PersistedBoothState = Pick<
	BoothState,
	"settings" | "deviceId" | "background" | "backgroundChosen"
>;

export type BoothStore = ReturnType<typeof createBoothStore>;

export function createBoothStore(backgrounds: Backdrop[]) {
	return createStore<BoothState>()(
		persist<BoothState, [], [], PersistedBoothState>(
			() => ({
				settings: initialSettings,
				galleryVisible: true,
				devices: [],
				deviceId: "",
				background: backgrounds[0]?.url ?? "",
				backgroundChosen: false,
				keyDetected: null,
				frameReady: false,
				frameSize: null,
				frameError: "",
				connected: false,
				connecting: false,
				resolution: "",
				message: "",
				countdown: null,
				photo: null,
			}),
			{
				name: "photo-booth-preferences",
				storage: createJSONStorage(() => localStorage),
				partialize: (state) => ({
					settings: state.settings,
					deviceId: state.deviceId,
					background: state.background,
					backgroundChosen: state.backgroundChosen,
				}),
				merge: (persistedState, currentState) => {
					const persisted = persistedState as
						| Partial<PersistedBoothState>
						| undefined;
					return {
						...currentState,
						...persisted,
						settings: {
							...currentState.settings,
							...persisted?.settings,
						},
					};
				},
				skipHydration: true,
			},
		),
	);
}
