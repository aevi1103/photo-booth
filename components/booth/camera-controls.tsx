"use client";

import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";

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

	return (
		<div className={className}>
			<div className="min-w-0 flex-1">
				<label className="sr-only" htmlFor={id}>
					CAMERA
				</label>
				<select
					id={id}
					aria-label={accessibleName}
					className="w-full min-w-0 rounded-lg border border-[#dcebf2] bg-[#fbfdff] p-2.5 text-[13px] text-[#416a80]"
					value={deviceId}
					disabled={connecting || countdown !== null || photo !== null}
					onChange={(event) => store.setState({ deviceId: event.target.value })}
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
			</div>
			<Button
				className="min-h-[38px]"
				variant="outline"
				disabled={connecting || countdown !== null || photo !== null}
				onClick={() => onConnect(deviceId)}
			>
				{connecting ? "Connecting..." : "Connect"}
			</Button>
		</div>
	);
}
