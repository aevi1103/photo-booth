"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useStore } from "zustand";
import type { BoothStore } from "@/components/booth/store/store";
import { isPhotoQuota } from "@/lib/photo-quota";

export function useBoothQuota(store: BoothStore) {
	const router = useRouter();
	const { quota, quotaError } = useStore(store);

	const refreshQuota = useCallback(async () => {
		try {
			const response = await fetch("/api/account", {
				cache: "no-store",
				signal: AbortSignal.timeout(20_000),
			});
			if (response.status === 401) {
				router.replace("/login");
				return;
			}
			const result = await response.json();
			if (!response.ok || !isPhotoQuota(result.quota))
				throw new Error(
					result.error ?? "Could not load your upload allowance.",
				);
			store.setState({ quota: result.quota, quotaError: "" });
		} catch (error) {
			store.setState({
				quotaError:
					error instanceof Error
						? error.message
						: "Could not load your upload allowance.",
				quota: null,
			});
		}
	}, [router, store]);

	useEffect(() => {
		void refreshQuota();
		const refresh = () => {
			void refreshQuota();
		};
		window.addEventListener("focus", refresh);
		return () => window.removeEventListener("focus", refresh);
	}, [refreshQuota]);

	return { quota, quotaError, refreshQuota };
}
