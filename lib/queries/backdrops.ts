import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { prepareBackdropFile } from "@/lib/backdrop-transparency";
import {
	BACKDROP_SIZE_ERROR,
	type Backdrop,
	backdropTypes,
	MAX_BACKDROP_BYTES,
	type ManagedBackdrop,
} from "@/lib/backdrops";
import { isRecord, requestJson } from "@/lib/queries/http";

export const backdropKeys = {
	all: ["backdrops"] as const,
	list: () => [...backdropKeys.all, "list"] as const,
	manage: () => [...backdropKeys.all, "manage"] as const,
};

export const backdropQueries = {
	list: () =>
		queryOptions({
			queryKey: backdropKeys.list(),
			queryFn: async ({ signal }): Promise<Backdrop[]> => {
				const body = await requestJson(
					"/api/backdrops",
					"Could not load backdrops.",
					{ signal },
				);
				if (
					!isRecord(body) ||
					!Array.isArray(body.backdrops) ||
					!body.backdrops.every(
						(item: unknown) =>
							isRecord(item) &&
							typeof item.name === "string" &&
							typeof item.url === "string" &&
							(item.isDefault === undefined ||
								typeof item.isDefault === "boolean"),
					)
				)
					throw new Error("Could not load backdrops.");
				return body.backdrops;
			},
			staleTime: 30_000,
		}),
	manage: () =>
		queryOptions({
			queryKey: backdropKeys.manage(),
			queryFn: async ({ signal }): Promise<ManagedBackdrop[]> => {
				const body = await requestJson(
					"/api/backdrops?manage=1",
					"Could not load backdrops.",
					{ signal },
				);
				if (
					!isRecord(body) ||
					!Array.isArray(body.backdrops) ||
					!body.backdrops.every(
						(item: unknown) =>
							isRecord(item) &&
							typeof item.file === "string" &&
							typeof item.name === "string" &&
							typeof item.url === "string" &&
							typeof item.hidden === "boolean" &&
							typeof item.isDefault === "boolean",
					)
				)
					throw new Error("Could not load backdrops.");
				return body.backdrops;
			},
			staleTime: 30_000,
		}),
};

export function useBackdrops() {
	return useQuery(backdropQueries.list());
}

export function useManagedBackdrops() {
	return useQuery(backdropQueries.manage());
}

export function useUpdateBackdrop() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (update: {
			file: string;
			hidden?: boolean;
			isDefault?: boolean;
		}) => {
			const body = await requestJson(
				"/api/backdrops",
				"Could not update the backdrop.",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(update),
				},
			);
			if (!isRecord(body) || body.saved !== true)
				throw new Error("Could not confirm the backdrop update.");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: backdropKeys.all }),
	});
}

export function useUploadBackdrop() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ file, name }: { file: File; name: string }) => {
			if (file.size > MAX_BACKDROP_BYTES) throw new Error(BACKDROP_SIZE_ERROR);
			if (!backdropTypes.includes(file.type))
				throw new Error("Choose a JPEG, PNG, or WebP image.");
			// JPEGs with a fake "transparent" checkerboard window become PNGs
			// with a real transparent window before they are uploaded.
			const upload = await prepareBackdropFile(file, MAX_BACKDROP_BYTES);
			if (upload.size > MAX_BACKDROP_BYTES)
				throw new Error(BACKDROP_SIZE_ERROR);
			const body = await requestJson(
				`/api/backdrops?name=${encodeURIComponent(name)}`,
				"Could not save backdrop.",
				{
					method: "POST",
					headers: { "Content-Type": upload.type },
					body: upload,
				},
			);
			if (!isRecord(body) || body.saved !== true)
				throw new Error("Could not confirm backdrop saving.");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: backdropKeys.all }),
	});
}
