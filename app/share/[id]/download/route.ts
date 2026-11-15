import { readSharedPhoto, readShareId } from "@/features/share/server";
import { appOrigin } from "@/lib/app-origin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const headers = {
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"X-Robots-Tag": "noindex, nofollow",
		"Referrer-Policy": "no-referrer",
	};
	const origin = request.headers.get("origin");
	if (origin && origin !== appOrigin(request)) {
		return new Response("Invalid download origin.", { status: 403, headers });
	}
	try {
		const { id } = await params;
		const name = readShareId(id);
		const photo = name ? await readSharedPhoto(id) : null;
		if (!photo) {
			return new Response("This photo link is invalid, expired or deleted.", {
				status: 404,
				headers,
			});
		}
		const { data, error } = await createAdminClient().rpc(
			"record_photo_download",
			{ p_name: name },
		);
		if (error || data !== true) {
			throw new Error(error?.message ?? "Could not record the photo download.");
		}
		const extension =
			photo.type === "image/png"
				? "png"
				: photo.type === "image/webp"
					? "webp"
					: "jpg";
		return new Response(photo, {
			headers: {
				...headers,
				"Content-Type": photo.type,
				"Content-Disposition": `attachment; filename="photo-memory.${extension}"`,
			},
		});
	} catch (error) {
		console.error("Photo download failed:", error);
		return new Response("Could not download this photo. Please try again.", {
			status: 503,
			headers,
		});
	}
}
