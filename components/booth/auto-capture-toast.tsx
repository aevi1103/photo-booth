"use client";

import { useEffect, useRef, useState } from "react";
import {
	createToastManager,
	Toast,
	ToastContent,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	useToastManager,
} from "@/components/ui/toast";

function CaptureToastContent({ message }: { message: string | null }) {
	const { toasts, add, close, update } = useToastManager();
	const idRef = useRef<string | null>(null);

	useEffect(() => {
		if (!message) {
			if (idRef.current) close(idRef.current);
			idRef.current = null;
		} else if (idRef.current) {
			update(idRef.current, { title: message });
		} else {
			idRef.current = add({ title: message, timeout: 0 });
		}
	}, [message, add, close, update]);

	return (
		<ToastPortal>
			<ToastViewport className="top-1/2 right-auto bottom-auto left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 sm:right-auto sm:left-1/2 sm:mx-auto">
				{toasts.map((item) => (
					<Toast
						key={item.id}
						toast={item}
						className="pointer-events-none top-0 bottom-auto [translate:0_-50%]"
					>
						<ToastContent>
							<ToastTitle className="w-full text-center" />
						</ToastContent>
					</Toast>
				))}
			</ToastViewport>
		</ToastPortal>
	);
}

export function AutoCaptureToast({ message }: { message: string | null }) {
	const [manager] = useState(() => createToastManager());
	return (
		<ToastProvider toastManager={manager} limit={1}>
			<CaptureToastContent message={message} />
		</ToastProvider>
	);
}
