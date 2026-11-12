import { appOrigin } from "@/lib/app-origin";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
	BACKDROP_SIZE_ERROR,
	backdropTypes,
	isBackdropImage,
	MAX_BACKDROP_BYTES,
} from "@/lib/backdrops";
import { createAdminClient } from "@/lib/supabase/admin";

const headers = { "Cache-Control": "private, no-store" };
const filenamePattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[a-z0-9-]{1,80}\.(jpg|png|webp)$/;

export async function GET(request: Request) {
	const auth = await requireUser();
	if (auth.response) return auth.response;
	const bucket = createAdminClient().storage.from("backdrops");
	const file = new URL(request.url).searchParams.get("file");
	if (file !== null) {
		if (!filenamePattern.test(file))
			return Response.json(
				{ error: "Invalid backdrop." },
				{ status: 400, headers },
			);
		const { data, error } = await bucket.download(file);
		if (error || !data) {
			console.error("Backdrop download failed:", error?.message);
			return Response.json(
				{ error: "Could not open backdrop. Please retry." },
				{ status: 503, headers },
			);
		}
		const type = file.endsWith(".jpg")
			? "image/jpeg"
			: file.endsWith(".png")
				? "image/png"
				: "image/webp";
		return new Response(data, {
			headers: {
				...headers,
				"Content-Type": type,
				"X-Content-Type-Options": "nosniff",
			},
		});
	}
	const backdrops = [];
	for (let offset = 0; ; offset += 100) {
		const { data, error } = await bucket.list("", {
			limit: 100,
			offset,
			sortBy: { column: "name", order: "asc" },
		});
		if (error || !data) {
			console.error("Backdrop listing failed:", error?.message);
			return Response.json(
				{ error: "Could not load backdrops. Please retry." },
				{ status: 503, headers },
			);
		}
		for (const item of data) {
			if (item.id && filenamePattern.test(item.name))
				backdrops.push({
					name: item.name
						.slice(37)
						.replace(/\.[^.]+$/, "")
						.replace(/-/g, " "),
					url: `/api/backdrops?file=${encodeURIComponent(item.name)}`,
				});
		}
		if (data.length < 100) break;
	}
	return Response.json({ backdrops }, { headers });
}

export async function POST(request: Request) {
	const auth = await requireAdmin();
	if (auth.response) return auth.response;
	const origin = request.headers.get("origin");
	if (origin && origin !== appOrigin(request))
		return Response.json(
			{ error: "Invalid upload origin." },
			{ status: 403, headers },
		);
	const type = request.headers.get("content-type") ?? "";
	if (!backdropTypes.includes(type))
		return Response.json(
			{ error: "Only JPEG, PNG, and WebP backdrops are accepted." },
			{ status: 415, headers },
		);
	if (Number(request.headers.get("content-length")) > MAX_BACKDROP_BYTES)
		return Response.json(
			{ error: BACKDROP_SIZE_ERROR },
			{ status: 413, headers },
		);
	if (!request.body)
		return Response.json(
			{ error: "No backdrop was provided." },
			{ status: 400, headers },
		);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > MAX_BACKDROP_BYTES) {
			await reader.cancel();
			return Response.json(
				{ error: BACKDROP_SIZE_ERROR },
				{ status: 413, headers },
			);
		}
		chunks.push(value);
	}
	const image = Buffer.concat(chunks);
	if (!isBackdropImage(image, type))
		return Response.json(
			{ error: "The backdrop is not a valid image of the selected type." },
			{ status: 400, headers },
		);
	const name =
		(new URL(request.url).searchParams.get("name") ?? "backdrop")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 80) || "backdrop";
	const extension =
		type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
	const client = createAdminClient();
	const { data: allowed, error: limitError } =
		await client.rpc("allow_photo_upload");
	if (limitError) {
		console.error("Backdrop rate limit failed:", limitError.message);
		return Response.json(
			{ error: "Backdrop saving is temporarily unavailable." },
			{ status: 503, headers },
		);
	}
	if (!allowed)
		return Response.json(
			{ error: "Too many uploads. Please wait a minute and retry." },
			{ status: 429, headers },
		);
	const { error } = await client.storage
		.from("backdrops")
		.upload(`${crypto.randomUUID()}_${name}.${extension}`, image, {
			contentType: type,
			upsert: false,
		});
	if (error) {
		console.error("Backdrop upload failed:", error.message);
		return Response.json(
			{ error: "Could not save backdrop. Please retry." },
			{ status: 503, headers },
		);
	}
	return Response.json({ saved: true }, { headers });
}
