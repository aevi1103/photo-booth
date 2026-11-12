"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import { CameraControls } from "@/components/booth/camera-controls";
import type { BoothStore } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";

export function BoothSettings({
	store,
	onConnect,
	menu,
	desktopVisible,
}: {
	store: BoothStore;
	onConnect: (deviceId: string) => void;
	menu: ReactNode;
	desktopVisible: boolean;
}) {
	const { settings, settingsOpen } = useStore(store);

	return (
		<aside
			id="booth-settings-panel"
			className={`controls-card rounded-[18px] border border-[#e6f0f5] bg-white p-6 shadow-[0_10px_35px_#8daec314] min-[801px]:p-4 [@media(min-width:801px)_and_(min-height:600px)]:max-h-full [@media(min-width:801px)_and_(min-height:600px)]:overflow-y-auto ${desktopVisible ? "" : "min-[801px]:hidden"}`}
		>
			<div className="mb-3 flex justify-end">{menu}</div>
			<Button
				className="hidden min-h-11 w-full [@media(max-width:800px)]:inline-flex"
				variant="outline"
				type="button"
				aria-expanded={settingsOpen}
				aria-controls="booth-settings"
				onClick={() => store.setState({ settingsOpen: !settingsOpen })}
			>
				{settingsOpen ? "Hide settings" : "Show settings"}
			</Button>
			<div
				id="booth-settings"
				className={`booth-settings ${settingsOpen ? "is-open [@media(max-width:800px)]:mt-5 [@media(max-width:800px)]:block" : "[@media(max-width:800px)]:hidden"}`}
			>
				<div className="mb-6 flex items-center gap-3 min-[801px]:mb-4">
					<span className="rounded-[11px] bg-[#e8f5fb] p-[11px] text-[#79aec8] min-[801px]:p-2">
						<Sparkles size={19} />
					</span>
					<h2 className="text-[16px] font-bold text-[#365e74]">
						Make it yours
					</h2>
				</div>
				<div className="mt-5 min-[801px]:hidden">
					<CameraControls
						store={store}
						onConnect={onConnect}
						id="settings-camera"
						className="flex gap-[7px]"
					/>
					<p className="mt-[9px] text-xs leading-[1.5] text-[#8a9faa]">
						On a phone, choose Front camera or Rear camera, then Connect. Use
						HTTPS and allow camera access. Cam Link availability depends on your
						device and browser.
					</p>
				</div>
				<label className="mt-[18px] flex items-center gap-2 text-[13px] text-[#648193] min-[801px]:mt-3.5">
					<input
						type="checkbox"
						className="accent-[#6ba5c1]"
						checked={settings.greenScreen}
						onChange={(event) =>
							store.setState((state) => ({
								settings: {
									...state.settings,
									greenScreen: event.target.checked,
								},
							}))
						}
					/>{" "}
					Replace green screen
				</label>
				<label className="mt-[18px] flex items-center gap-2 text-[13px] text-[#648193] min-[801px]:mt-3.5">
					<input
						type="checkbox"
						className="accent-[#6ba5c1]"
						checked={settings.mirror}
						onChange={(event) =>
							store.setState((state) => ({
								settings: { ...state.settings, mirror: event.target.checked },
							}))
						}
					/>{" "}
					Mirror photo and preview
				</label>
				<details className="mt-5 border-t border-[#edf3f6] pt-[15px] text-[13px] text-[#648193] min-[801px]:mt-4">
					<summary className="cursor-pointer">Green screen settings</summary>
					<label
						className="mt-5 mb-[9px] block text-[10px] font-bold tracking-[.12em] text-[#7c9aaa] min-[801px]:mt-3.5 min-[801px]:mb-[7px]"
						htmlFor="key"
					>
						KEY COLOR
					</label>
					<input
						id="key"
						type="color"
						value={settings.color}
						onChange={(event) =>
							store.setState((state) => ({
								settings: { ...state.settings, color: event.target.value },
							}))
						}
					/>
					<label
						className="mt-5 mb-[9px] block text-[10px] font-bold tracking-[.12em] text-[#7c9aaa] min-[801px]:mt-3.5 min-[801px]:mb-[7px]"
						htmlFor="threshold"
					>
						KEY STRENGTH
					</label>
					<input
						id="threshold"
						type="range"
						className="w-full accent-[#78aeca]"
						min="0"
						max="1"
						step="0.01"
						value={settings.threshold}
						onChange={(event) =>
							store.setState((state) => ({
								settings: {
									...state.settings,
									threshold: Number(event.target.value),
								},
							}))
						}
					/>
					<label
						className="mt-5 mb-[9px] block text-[10px] font-bold tracking-[.12em] text-[#7c9aaa] min-[801px]:mt-3.5 min-[801px]:mb-[7px]"
						htmlFor="softness"
					>
						EDGE SOFTNESS
					</label>
					<input
						id="softness"
						type="range"
						className="w-full accent-[#78aeca]"
						min="0.01"
						max="1"
						step="0.01"
						value={settings.softness}
						onChange={(event) =>
							store.setState((state) => ({
								settings: {
									...state.settings,
									softness: Number(event.target.value),
								},
							}))
						}
					/>
				</details>
			</div>
		</aside>
	);
}
