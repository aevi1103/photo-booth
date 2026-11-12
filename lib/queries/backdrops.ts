import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	BACKDROP_SIZE_ERROR,
	type Backdrop,
	backdropTypes,
	MAX_BACKDROP_BYTES,
} from "@/lib/backdrops";
import { isRecord, requestJson } from "@/lib/queries/http";

export const backdropKeys = {
	all: ["backdrops"] as const,
	list: () => [...backdropKeys.all, "list"] as const,
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
							typeof item.url === "string",
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

export function useUploadBackdrop() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ file, name }: { file: File; name: string }) => {
			if (file.size > MAX_BACKDROP_BYTES) throw new Error(BACKDROP_SIZE_ERROR);
			if (!backdropTypes.includes(file.type))
				throw new Error("Choose a JPEG, PNG, or WebP image.");
			const image = await createImageBitmap(file);
			image.close();
			const body = await requestJson(
				`/api/backdrops?name=${encodeURIComponent(name)}`,
				"Could not save backdrop.",
				{
					method: "POST",
					headers: { "Content-Type": file.type },
					body: file,
				},
			);
			if (!isRecord(body) || body.saved !== true)
				throw new Error("Could not confirm backdrop saving.");
		},
		onSuccess: () =>
			client.invalidateQueries({ queryKey: backdropKeys.list() }),
	});
}
