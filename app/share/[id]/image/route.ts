import { readSharedPhoto } from "@/features/share/server";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const headers = {
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"X-Robots-Tag": "noindex, nofollow",
		"Referrer-Policy": "no-referrer",
	};
	try {
		const { id } = await params;
		const photo = await readSharedPhoto(id);
		if (!photo) {
			return new Response("This photo link is invalid, expired or deleted.", {
				status: 404,
				headers,
			});
		}
		return new Response(photo, {
			headers: { ...headers, "Content-Type": photo.type },
		});
	} catch (error) {
		console.error("Shared photo response failed:", error);
		return new Response("Could not load this photo. Please try again.", {
			status: 503,
			headers,
		});
	}
}
