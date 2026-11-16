"use client";

import type { BoothState } from "@/components/booth/store/store";
import { Button } from "@/components/ui/button";

export function PreviewAlerts({
	connected,
	photo,
	settings,
	keyDetected,
	backdropError,
	message,
	frameError,
	soundError,
	onRetryBackdrops,
}: {
	connected: boolean;
	photo: BoothState["photo"];
	settings: BoothState["settings"];
	keyDetected: boolean | null;
	backdropError?: string;
	message: string;
	frameError: string;
	soundError?: string;
	onRetryBackdrops: () => void;
}) {
	return (
		<>
			{connected && !photo && settings.greenScreen && keyDetected === false && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="status"
				>
					The camera can&apos;t see the green key color, so green areas
					won&apos;t be replaced. Stand in front of a green screen that matches
					the saved key color.
				</p>
			)}
			{backdropError && (
				<>
					<p
						className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
						role="alert"
					>
						{backdropError}
					</p>
					<Button variant="outline" onClick={onRetryBackdrops}>
						Retry backdrops
					</Button>
				</>
			)}
			{message && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{message}
				</p>
			)}
			{frameError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{frameError}
				</p>
			)}
			{soundError && (
				<p
					className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-2.75 text-[13px] text-[#934b43]"
					role="alert"
				>
					{soundError}
				</p>
			)}
		</>
	);
}
