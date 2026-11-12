import { isPhotoQuota } from "@/lib/photo-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

export async function requireUser() {
	const client = await createSessionClient();
	const {
		data: { user },
		error,
	} = await client.auth.getUser();
	if (error || !user) {
		if (error && error.name !== "AuthSessionMissingError")
			console.error("API session validation failed:", error.message);
		return {
			response: Response.json(
				{ error: "Sign in to continue." },
				{ status: 401, headers: { "Cache-Control": "no-store" } },
			),
		};
	}

	return { user };
}

export async function requireAdmin() {
	const auth = await requireUser();
	if (auth.response) return auth;
	const { data, error } = await createAdminClient().rpc("get_photo_quota", {
		p_user_id: auth.user.id,
	});
	const headers = { "Cache-Control": "private, no-store" };
	if (error || !isPhotoQuota(data)) {
		console.error(
			"Admin role lookup failed:",
			error?.message ?? "Invalid booth profile.",
		);
		return {
			response: Response.json(
				{ error: "Could not verify admin access. Please retry." },
				{ status: 503, headers },
			),
		};
	}
	if (data.role !== "admin")
		return {
			response: Response.json(
				{ error: "Admin access is required." },
				{ status: 403, headers },
			),
		};
	return { user: auth.user, response: undefined };
}
