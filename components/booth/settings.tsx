"use client";

import { Sparkles } from "lucide-react";
import { useStore } from "zustand";
import type { Backdrop, BoothStore } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";

export function BoothSettings({
	store,
	backgrounds,
	onConnect,
}: {
	store: BoothStore;
	backgrounds: Backdrop[];
	onConnect: (deviceId: string) => void;
}) {
	const {
		settings,
		settingsOpen,
		devices,
		deviceId,
		background,
		connecting,
		countdown,
		photo,
	} = useStore(store);

	return (
		<aside className="controls-card">
			<Button
				className="mobile-settings-toggle"
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
				className={`booth-settings${settingsOpen ? " is-open" : ""}`}
			>
				<div className="card-title">
					<span className="icon-bubble">
						<Sparkles size={19} />
					</span>
					<h2>Make it yours</h2>
				</div>
				<label htmlFor="camera">CAMERA</label>
				<div className="camera-row">
					<select
						id="camera"
						value={deviceId}
						disabled={connecting || countdown !== null || photo !== null}
						onChange={(event) =>
							store.setState({ deviceId: event.target.value })
						}
					>
						<option value="">Default camera</option>
						<option value="facing:user">Front camera (selfie)</option>
						<option value="facing:environment">Rear camera</option>
						{devices
							.filter((device) => device.deviceId)
							.map((device, index) => (
								<option key={device.deviceId} value={device.deviceId}>
									{device.label || `Camera ${index + 1}`}
								</option>
							))}
					</select>
					<Button
						variant="outline"
						disabled={connecting || countdown !== null || photo !== null}
						onClick={() => onConnect(deviceId)}
					>
						{connecting ? "Connecting..." : "Connect"}
					</Button>
				</div>
				<p className="small camera-help">
					On a phone, choose Front camera or Rear camera, then Connect. Use
					HTTPS and allow camera access. Cam Link availability depends on your
					device and browser.
				</p>
				<label className="checkbox">
					<input
						type="checkbox"
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
				{settings.greenScreen && (
					<>
						<fieldset className="background-list">
							<legend className="backdrop-label">CHOOSE A BACKDROP</legend>
							{backgrounds.map((item) => (
								<button
									key={item.url}
									type="button"
									className={`background-option ${background === item.url ? "selected" : ""}`}
									aria-pressed={background === item.url}
									onClick={() => store.setState({ background: item.url })}
								>
									<img src={item.url} alt="" />
									<span>{item.name}</span>
								</button>
							))}
						</fieldset>
						{!backgrounds.length && (
							<p className="small">
								Add images to the public/images folder to use a backdrop.
							</p>
						)}
					</>
				)}
				<label className="checkbox">
					<input
						type="checkbox"
						checked={settings.mirror}
						onChange={(event) =>
							store.setState((state) => ({
								settings: { ...state.settings, mirror: event.target.checked },
							}))
						}
					/>{" "}
					Mirror photo and preview
				</label>
				<details>
					<summary>Green screen settings</summary>
					<label htmlFor="key">KEY COLOR</label>
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
					<label htmlFor="threshold">KEY STRENGTH</label>
					<input
						id="threshold"
						type="range"
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
					<label htmlFor="softness">EDGE SOFTNESS</label>
					<input
						id="softness"
						type="range"
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
