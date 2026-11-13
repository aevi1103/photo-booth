"use client";

import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";

export function CameraControls({
	store,
	onConnect,
	id,
	className,
	accessibleName,
}: {
	store: BoothStore;
	onConnect: (deviceId: string) => void;
	id: string;
	className: string;
	accessibleName?: string;
}) {
	const { devices, deviceId, connecting, countdown, photo } = useStore(store);
	const disabled = connecting || countdown !== null || photo !== null;
	const cameraOptions = [
		{ value: "", label: "Default camera" },
		{ value: "facing:user", label: "Front camera (selfie)" },
		{ value: "facing:environment", label: "Rear camera" },
		...devices
			.filter((device) => device.deviceId)
			.map((device, index) => ({
				value: device.deviceId,
				label: device.label || `Camera ${index + 1}`,
			})),
	];

	return (
		<div className={className}>
			<div className="min-w-0 flex-1">
				<label className="sr-only" htmlFor={id}>
					CAMERA
				</label>
				<Combobox
					value={deviceId}
					itemToStringLabel={(value) =>
						cameraOptions.find((option) => option.value === value)?.label ??
						value
					}
					onValueChange={(value) => store.setState({ deviceId: value ?? "" })}
					disabled={disabled}
				>
					<ComboboxInput
						id={id}
						aria-label={accessibleName}
						disabled={disabled}
						placeholder="Select a camera..."
					/>
					<ComboboxContent>
						<ComboboxEmpty>No cameras found.</ComboboxEmpty>
						<ComboboxList>
							{cameraOptions.map(({ value, label }) => (
								<ComboboxItem key={value || "default"} value={value}>
									{label}
								</ComboboxItem>
							))}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
			</div>
			<Button
				variant="outline"
				disabled={disabled}
				onClick={() => onConnect(deviceId)}
			>
				{connecting ? "Connecting..." : "Connect"}
			</Button>
		</div>
	);
}
