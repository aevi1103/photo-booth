import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SHARE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

function sign(payload: string) {
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new Error("Missing Supabase service-role key.");
	return createHmac("sha256", key).update(`photo-share:v1:${payload}`).digest();
}

export function createShareId(name: string) {
	const expires = Math.floor(Date.now() / 1000) + SHARE_LIFETIME_SECONDS;
	const payload = Buffer.from(`${expires}:${name}`).toString("base64url");
	return `${payload}.${sign(payload).toString("base64url")}`;
}

function readShareId(id: string) {
	if (id.length > 8192) return null;
	const [payload, signature, extra] = id.split(".");
	if (
		extra !== undefined ||
		!payload ||
		!/^[\w-]+$/.test(payload) ||
		!signature ||
		!/^[\w-]{43}$/.test(signature)
	) {
		return null;
	}
	const supplied = Buffer.from(signature, "base64url");
	if (!timingSafeEqual(supplied, sign(payload))) return null;
	const decoded = Buffer.from(payload, "base64url").toString("utf8");
	const separator = decoded.indexOf(":");
	const expires = Number(decoded.slice(0, separator));
	const name = decoded.slice(separator + 1);
	if (
		separator < 1 ||
		!Number.isSafeInteger(expires) ||
		expires <= Date.now() / 1000 ||
		!name
	) {
		return null;
	}
	return name;
}

// Deduplicate metadata/page reads within a request, never across requests.
export const readSharedPhoto = cache(async (id: string) => {
	await connection();
	const name = readShareId(id);
	if (!name) return null;
	const { data, error } = await createAdminClient()
		.storage.from("photos")
		.download(name, {}, { cache: "no-store" });
	if (error) {
		if (
			("statusCode" in error && Number(error.statusCode) === 404) ||
			("code" in error && error.code === "NoSuchKey")
		) {
			return null;
		}
		console.error("Shared photo download failed:", error.message);
		throw new Error("Could not load this photo. Please try again.");
	}
	if (!data) throw new Error("The shared photo could not be loaded.");
	if (!["image/jpeg", "image/png", "image/webp"].includes(data.type)) {
		console.error("Shared photo has an unsupported content type:", data.type);
		throw new Error("The shared photo is not a supported image.");
	}
	return data;
});
