import { createStore, type StoreApi } from "zustand/vanilla";
import type { PhotoQuota } from "@/lib/photo-quota";

export type Backdrop = { name: string; url: string };
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
	frameReady: boolean;
	connected: boolean;
	connecting: boolean;
	resolution: string;
	message: string;
	countdown: number | null;
	photo: Photo | null;
	uploadState: string;
	uploadStatus: "idle" | "saving" | "saved" | "failed";
	quota: PhotoQuota | null;
	quotaError: string;
};

export type BoothStore = StoreApi<BoothState>;

export function createBoothStore(backgrounds: Backdrop[]): BoothStore {
	return createStore<BoothState>(() => ({
		settings: initialSettings,
		settingsOpen: false,
		devices: [],
		deviceId: "",
		background: backgrounds[0]?.url ?? "",
		frameReady: false,
		connected: false,
		connecting: false,
		resolution: "",
		message: "",
		countdown: null,
		photo: null,
		uploadState: "",
		uploadStatus: "idle",
		quota: null,
		quotaError: "",
	}));
}
