import { expect, test } from "@playwright/test";

test("the login page exposes an installable manifest and public icons", async ({
	page,
	request,
}) => {
	await page.goto("/login");
	const manifestLink = page.locator('link[rel="manifest"]');
	await expect(manifestLink).toHaveAttribute("href", "/manifest.webmanifest");
	await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
		"href",
		"/icons/apple-touch-icon.png",
	);

	const response = await request.get("/manifest.webmanifest");
	expect(response.status()).toBe(200);
	const manifest = await response.json();
	expect(manifest).toMatchObject({
		name: "Little Cloud Photo Booth",
		start_url: "/",
		display: "standalone",
	});
	expect(manifest.icons).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				src: "/icons/icon-192.png",
				sizes: "192x192",
				type: "image/png",
			}),
			expect.objectContaining({
				src: "/icons/icon-512.png",
				sizes: "512x512",
				type: "image/png",
			}),
		]),
	);

	for (const [path, size] of [
		["/icons/icon-192.png", 192],
		["/icons/icon-512.png", 512],
		["/icons/apple-touch-icon.png", 180],
	] as const) {
		const icon = await request.get(path);
		expect(icon.status()).toBe(200);
		expect(icon.headers()["content-type"]).toContain("image/png");
		const bytes = await icon.body();
		expect(bytes.readUInt32BE(16)).toBe(size);
		expect(bytes.readUInt32BE(20)).toBe(size);
	}

	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});
