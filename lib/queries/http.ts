export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export const isUnauthorized = (error: unknown) =>
	error instanceof ApiError && error.status === 401;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

const REQUEST_TIMEOUT_MS = 20_000;

function withTimeout(signal?: AbortSignal) {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	// AbortSignal.any is missing on older mobile Safari; fall back to the timeout alone.
	return signal && "any" in AbortSignal
		? AbortSignal.any([signal, timeout])
		: timeout;
}

/** Fetches a private, non-cacheable API route and throws an ApiError with the server's message on failure. */
export async function requestJson(
	url: string,
	fallbackError: string,
	init: RequestInit = {},
): Promise<unknown> {
	const response = await fetch(url, {
		...init,
		cache: "no-store",
		signal: withTimeout(init.signal ?? undefined),
	});
	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			isRecord(body) && typeof body.error === "string"
				? body.error
				: fallbackError;
		throw new ApiError(message, response.status, body);
	}
	return body;
}
