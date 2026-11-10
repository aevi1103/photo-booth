import {
	type QueryClient,
	queryOptions,
	useQuery,
} from "@tanstack/react-query";
import { isPhotoQuota, type PhotoQuota } from "@/lib/photo-quota";
import { isRecord, requestJson } from "@/lib/queries/http";

const QUOTA_ERROR = "Could not load your upload allowance.";

export const accountKeys = {
	all: ["account"] as const,
	quota: () => [...accountKeys.all, "quota"] as const,
};

async function fetchQuota(signal: AbortSignal): Promise<PhotoQuota> {
	const body = await requestJson("/api/account", QUOTA_ERROR, { signal });
	if (!isRecord(body) || !isPhotoQuota(body.quota))
		throw new Error(QUOTA_ERROR);
	return body.quota;
}

export const accountQueries = {
	quota: () =>
		queryOptions({
			queryKey: accountKeys.quota(),
			queryFn: ({ signal }) => fetchQuota(signal),
			// Quota gates capture, so keep it fresh; it also refetches on window focus.
			staleTime: 10_000,
		}),
};

export function useQuota() {
	return useQuery(accountQueries.quota());
}

/** Fails closed: capture needs a successfully loaded quota with room left. A failed refresh blocks capture. */
export function quotaAllowsCapture(
	status: "pending" | "error" | "success",
	quota: PhotoQuota | undefined,
) {
	return status === "success" && quota !== undefined && quota.remaining !== 0;
}

export function canCaptureFromCache(client: QueryClient) {
	const state = client.getQueryState<PhotoQuota>(accountKeys.quota());
	return quotaAllowsCapture(state?.status ?? "pending", state?.data);
}

/** Optimistic view of the quota after one more upload is reserved. */
export function reserveOne(quota: PhotoQuota): PhotoQuota {
	if (quota.role === "admin") return { ...quota, used: quota.used + 1 };
	const used = quota.used + 1;
	return { ...quota, used, remaining: Math.max(0, (quota.limit ?? 0) - used) };
}
