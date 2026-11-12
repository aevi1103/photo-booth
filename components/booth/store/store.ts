import { createStore, type StoreApi } from "zustand/vanilla";

export type { Backdrop } from "@/lib/backdrops";

import type { Backdrop } from "@/lib/backdrops";
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
	mirror: false,
	greenScreen: false,
};

export type BoothState = {
	settings: Settings;
	settingsOpen: boolean;
	devices: MediaDeviceInfo[];
	deviceId: string;
	background: string;
	backgroundChosen: boolean;
	keyDetected: boolean | null;
	frameReady: boolean;
	connected: boolean;
	connecting: boolean;
	resolution: string;
	message: string;
	countdown: number | null;
	photo: Photo | null;
};

export type BoothStore = StoreApi<BoothState>;

export function createBoothStore(backgrounds: Backdrop[]): BoothStore {
	return createStore<BoothState>(() => ({
		settings: initialSettings,
		settingsOpen: false,
		devices: [],
		deviceId: "",
		background: backgrounds[0]?.url ?? "",
		backgroundChosen: false,
		keyDetected: null,
		frameReady: false,
		connected: false,
		connecting: false,
		resolution: "",
		message: "",
		countdown: null,
		photo: null,
	}));
}
