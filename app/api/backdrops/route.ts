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

type BackdropBucket = ReturnType<
	ReturnType<typeof createAdminClient>["storage"]["from"]
>;

function displayName(file: string) {
	return file
		.slice(37)
		.replace(/\.[^.]+$/, "")
		.replace(/-/g, " ");
}

async function listBackdropFiles(bucket: BackdropBucket) {
	const files: string[] = [];
	for (let offset = 0; ; offset += 100) {
		const { data, error } = await bucket.list("", {
			limit: 100,
			offset,
			sortBy: { column: "name", order: "asc" },
		});
		if (error || !data) {
			console.error("Backdrop listing failed:", error?.message);
			return { error: true as const };
		}
		for (const item of data) {
			if (item.id && filenamePattern.test(item.name)) files.push(item.name);
		}
		if (data.length < 100) break;
	}
	return { files };
}

type BackdropSetting = { hidden: boolean; isDefault: boolean };

async function getBackdropSettings(
	client: ReturnType<typeof createAdminClient>,
) {
	const { data, error } = await client.rpc("get_backdrop_settings");
	if (error || !Array.isArray(data)) {
		console.error("Backdrop settings lookup failed:", error?.message);
		return { error: true as const };
	}
	const settings = new Map<string, BackdropSetting>();
	for (const row of data) {
		if (typeof row?.file_name === "string")
			settings.set(row.file_name, {
				hidden: row.hidden === true,
				isDefault: row.is_default === true,
			});
	}
	return { settings };
}

export async function GET(request: Request) {
	const auth = await requireUser();
	if (auth.response) return auth.response;
	const client = createAdminClient();
	const bucket = client.storage.from("backdrops");
	const url = new URL(request.url);
	const file = url.searchParams.get("file");
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
	const manage = url.searchParams.get("manage") !== null;
	if (manage) {
		const admin = await requireAdmin();
		if (admin.response) return admin.response;
	}
	const [listing, lookup] = await Promise.all([
		listBackdropFiles(bucket),
		getBackdropSettings(client),
	]);
	if (listing.error || lookup.error)
		return Response.json(
			{ error: "Could not load backdrops. Please retry." },
			{ status: 503, headers },
		);
	if (manage)
		return Response.json(
			{
				backdrops: listing.files.map((name) => ({
					file: name,
					name: displayName(name),
					url: `/api/backdrops?file=${encodeURIComponent(name)}`,
					hidden: lookup.settings.get(name)?.hidden ?? false,
					isDefault: lookup.settings.get(name)?.isDefault ?? false,
				})),
			},
			{ headers },
		);
	const backdrops = [];
	for (const name of listing.files) {
		const setting = lookup.settings.get(name);
		if (setting?.hidden) continue;
		backdrops.push({
			name: displayName(name),
			url: `/api/backdrops?file=${encodeURIComponent(name)}`,
			...(setting?.isDefault ? { isDefault: true } : {}),
		});
	}
	return Response.json({ backdrops }, { headers });
}

export async function PATCH(request: Request) {
	const auth = await requireAdmin();
	if (auth.response) return auth.response;
	const origin = request.headers.get("origin");
	if (origin && origin !== appOrigin(request))
		return Response.json(
			{ error: "Invalid update origin." },
			{ status: 403, headers },
		);
	const body: unknown = await request.json().catch(() => null);
	const update =
		body && typeof body === "object"
			? (body as { file?: unknown; hidden?: unknown; isDefault?: unknown })
			: {};
	const { file, hidden, isDefault } = update;
	if (
		typeof file !== "string" ||
		!filenamePattern.test(file) ||
		(hidden !== undefined && typeof hidden !== "boolean") ||
		(isDefault !== undefined && typeof isDefault !== "boolean") ||
		(hidden === undefined && isDefault === undefined)
	)
		return Response.json(
			{ error: "Invalid backdrop update." },
			{ status: 400, headers },
		);
	const client = createAdminClient();
	const listing = await listBackdropFiles(client.storage.from("backdrops"));
	if (listing.error)
		return Response.json(
			{ error: "Could not update the backdrop. Please retry." },
			{ status: 503, headers },
		);
	if (!listing.files.includes(file))
		return Response.json(
			{ error: "That backdrop no longer exists." },
			{ status: 404, headers },
		);
	const { error } = await client.rpc("set_backdrop_setting", {
		p_file_name: file,
		p_hidden: hidden ?? null,
		p_is_default: isDefault ?? null,
	});
	if (error) {
		console.error("Backdrop update failed:", error.message);
		return Response.json(
			{ error: "Could not update the backdrop. Please retry." },
			{ status: 503, headers },
		);
	}
	return Response.json({ saved: true }, { headers });
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
