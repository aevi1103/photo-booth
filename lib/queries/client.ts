import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/queries/http";

function shouldRetry(failureCount: number, error: unknown) {
	// Client errors (auth, validation) will not succeed on retry; transient 5xx/network failures get one more try.
	if (error instanceof ApiError && error.status < 500) return false;
	return failureCount < 1;
}

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000, retry: shouldRetry },
			// Uploads reserve quota on the server, so never replay them automatically.
			mutations: { retry: false },
		},
	});
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
	// Isolate server renders; reuse one cache in the browser.
	if (typeof window === "undefined") return makeQueryClient();
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}
