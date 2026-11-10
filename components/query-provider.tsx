"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { getQueryClient } from "@/lib/queries/client";
import { isUnauthorized } from "@/lib/queries/http";

export function QueryProvider({ children }: { children: ReactNode }) {
	const queryClient = getQueryClient();
	const router = useRouter();

	useEffect(
		() =>
			queryClient.getQueryCache().subscribe((event) => {
				if (
					event.type === "updated" &&
					event.action.type === "error" &&
					isUnauthorized(event.action.error)
				) {
					// The session is gone: drop private cached data and sign in again.
					router.replace("/login");
					queueMicrotask(() => queryClient.clear());
				}
			}),
		[queryClient, router],
	);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
