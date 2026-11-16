import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { unzipSync } from "fflate";
import {
	adminId,
	expect,
	otherId,
	sessionCookie,
	test,
	userId,
} from "./fixtures";

const name = `${userId}/memory.png`;
const otherName = `${otherId}/private.png`;
const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=",
	"base64",
);

test.beforeEach(async ({ backend }) => {
	await backend.db.query(
		"insert into storage.objects(bucket_id, name) values ('photos', $1), ('photos', $2)",
		[name, otherName],
	);
	backend.objects.set(name, png);
	backend.objects.set(otherName, png);
});

async function openPhoto(page: Page, path = "/gallery") {
	await page.route("**/storage/v1/object/sign/photos/**", (route) =>
		route.fulfill({ contentType: "image/png", body: png }),
	);
	await page.goto(path);
	await page.getByRole("button", { name: `Open photo ${name}` }).click();
	await expect(
		page.getByRole("heading", { name: "Photo memory" }),
	).toBeVisible();
}

for (const path of ["/", "/gallery"]) {
	test(`photo dialog downloads directly and can retry a failed download on ${path}`, async ({
		page,
		backend,
	}) => {
		await openPhoto(page, path);
		const dialog = page.getByRole("dialog", { name: "Photo memory" });
		const button = dialog.getByRole("button", { name: "Download image" });
		backend.storageError = 503;
		await button.click();
		await expect(dialog.getByRole("alert")).toContainText("Could not download");
		await expect(button).toBeEnabled();
		backend.storageError = null;
		const waiting = page.waitForEvent("download");
		await button.click();
		const download = await waiting;
		expect(download.suggestedFilename()).toBe("photo-memory.png");
		expect(await readFile(await download.path())).toEqual(png);
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("alert")).toHaveCount(0);
	});
}

test("gallery downloads one selected image or a ZIP containing only selected images", async ({
	page,
	backend,
}) => {
	const secondName = `${userId}/second.png`;
	await backend.db.query(
		"insert into storage.objects(bucket_id, name) values ('photos', $1)",
		[secondName],
	);
	backend.objects.set(secondName, png);
	await page.route("**/storage/v1/object/sign/photos/**", (route) =>
		route.fulfill({ contentType: "image/png", body: png }),
	);
	await page.goto("/gallery");
	await expect(page.getByRole("checkbox")).toHaveCount(2);
	await expect(
		page.getByRole("button", { name: "Delete", exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Download selected (0)" }),
	).toBeDisabled();
	await page
		.getByRole("checkbox", { name: `Select photo ${name}`, exact: true })
		.check();
	const singleWaiting = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download selected (1)" }).click();
	const single = await singleWaiting;
	expect(single.suggestedFilename()).toBe("photo-memory.png");
	expect(await readFile(await single.path())).toEqual(png);

	await page
		.getByRole("checkbox", { name: `Select photo ${secondName}`, exact: true })
		.check();
	const zipWaiting = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download selected (2)" }).click();
	const zip = await zipWaiting;
	expect(zip.suggestedFilename()).toBe("photo-memories.zip");
	const files = unzipSync(await readFile(await zip.path()));
	expect(Object.keys(files)).toEqual([
		"1-photo-memory.png",
		"2-photo-memory.png",
	]);
	for (const bytes of Object.values(files))
		expect(Buffer.from(bytes)).toEqual(png);
	expect(
		(
			await backend.db.query(
				"select photo_name as name, download_count from public.photo_download_counts order by photo_name",
			)
		).rows,
	).toEqual([
		{ name, download_count: 2 },
		{ name: secondName, download_count: 1 },
	]);
	await page
		.getByRole("checkbox", { name: `Select photo ${name}`, exact: true })
		.uncheck();
	await expect(
		page.getByRole("button", { name: "Download selected (1)" }),
	).toBeEnabled();
});

test("gallery does not save a partial ZIP and keeps the selection for retry", async ({
	page,
}) => {
	await page.context().addCookies([sessionCookie(adminId)]);
	await page.route("**/storage/v1/object/sign/photos/**", (route) =>
		route.fulfill({ contentType: "image/png", body: png }),
	);
	await page.goto("/gallery");
	await expect(page.getByRole("checkbox")).toHaveCount(2);
	for (const checkbox of await page.getByRole("checkbox").all())
		await checkbox.check();
	let requests = 0;
	await page.route("**/share/*/download", async (route) => {
		requests += 1;
		if (requests === 2) await route.fulfill({ status: 503 });
		else await route.continue();
	});
	let downloads = 0;
	page.on("download", () => {
		downloads += 1;
	});
	const button = page.getByRole("button", { name: "Download selected (2)" });
	await button.click();
	const error = page.getByRole("alert").filter({ hasText: "No ZIP was saved" });
	await expect(error).toBeVisible();
	await expect(button).toBeEnabled();
	expect(requests).toBe(2);
	expect(downloads).toBe(0);
	for (const checkbox of await page.getByRole("checkbox").all())
		await expect(checkbox).toBeChecked();
	const waiting = page.waitForEvent("download");
	await button.click();
	const zip = await waiting;
	expect(Object.keys(unzipSync(await readFile(await zip.path())))).toHaveLength(
		2,
	);
	await expect(error).toHaveCount(0);
});

test("explicit anonymous downloads count repeats, not views, and recover from failures", async ({
	page,
	request,
	backend,
}) => {
	const { photos } = await (await request.get("/api/photos")).json();
	const url: string = photos[0].shareUrl;
	await page.context().clearCookies();
	await page.goto(url);
	await expect(
		page.getByRole("img", { name: "Nugget Photo Booth memory" }),
	).toHaveJSProperty("naturalWidth", 1);
	expect(
		(await backend.db.query("select * from public.photo_download_counts")).rows,
	).toEqual([]);
	const button = page.getByRole("button", { name: "Download image" });
	for (const expected of [1, 2]) {
		const waiting = page.waitForEvent("download");
		await button.click();
		const download = await waiting;
		expect(download.suggestedFilename()).toBe("photo-memory.png");
		expect(await readFile(await download.path())).toEqual(png);
		expect(
			(
				await backend.db.query(
					"select download_count from public.photo_download_counts",
				)
			).rows,
		).toEqual([{ download_count: expected }]);
	}
	backend.storageError = 503;
	await button.click();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not download" }),
	).toBeVisible();
	expect(
		(
			await backend.db.query(
				"select download_count from public.photo_download_counts",
			)
		).rows,
	).toEqual([{ download_count: 2 }]);
	backend.storageError = null;
	await backend.db.exec(
		"alter table public.photo_download_counts add constraint test_count_failure check (download_count < 3)",
	);
	try {
		await button.click();
		await expect(button).toBeEnabled();
		await expect(
			page.getByRole("alert").filter({ hasText: "Could not download" }),
		).toBeVisible();
		expect(
			(
				await backend.db.query(
					"select download_count from public.photo_download_counts",
				)
			).rows,
		).toEqual([{ download_count: 2 }]);
	} finally {
		await backend.db.exec(
			"alter table public.photo_download_counts drop constraint test_count_failure",
		);
	}
	const waiting = page.waitForEvent("download");
	await button.click();
	await waiting;
	expect(
		(
			await backend.db.query(
				"select download_count from public.photo_download_counts",
			)
		).rows,
	).toEqual([{ download_count: 3 }]);
});

test("download counts are atomic, admin-only, and visible only in the standalone admin gallery", async ({
	page,
	request,
	backend,
	playwright,
}) => {
	const { photos } = await (await request.get("/api/photos")).json();
	const download = `${photos[0].shareUrl}/download`;
	const responses = await Promise.all(
		Array.from({ length: 10 }, () => request.post(download)),
	);
	expect(responses.every((response) => response.ok())).toBe(true);
	expect((await request.get(download)).status()).toBe(405);
	expect((await request.head(download)).status()).toBe(405);
	expect(
		(
			await request.post(download, {
				headers: { origin: "https://example.com" },
			})
		).status(),
	).toBe(403);
	const guest = await (await request.get("/api/photos")).json();
	expect(guest.photos[0]).not.toHaveProperty("downloadCount");
	const admin = await playwright.request.newContext({
		baseURL: "http://127.0.0.1:3210",
		storageState: { cookies: [sessionCookie(adminId)], origins: [] },
	});
	try {
		const listing = await (await admin.get("/api/photos")).json();
		expect(
			listing.photos.find((photo: { name: string }) => photo.name === name)
				.downloadCount,
		).toBe(10);
		expect(
			listing.photos.find((photo: { name: string }) => photo.name === otherName)
				.downloadCount,
		).toBe(0);
		expect(
			(
				await backend.db.query(
					"select * from public.get_photo_download_counts($1, $2)",
					[userId, [name]],
				)
			).rows,
		).toEqual([]);
		await page.context().addCookies([sessionCookie(adminId)]);
		await page.goto("/gallery");
		await expect(page.getByText("10 downloads", { exact: true })).toBeVisible();
		await expect(page.getByText("0 downloads", { exact: true })).toBeVisible();
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: `Open photo ${name}` }),
		).toBeVisible();
		await expect(page.getByText("10 downloads", { exact: true })).toHaveCount(
			0,
		);
		await page.context().addCookies([sessionCookie()]);
		await page.goto("/gallery");
		await expect(
			page.getByRole("button", { name: `Open photo ${name}` }),
		).toBeVisible();
		await expect(page.getByText("10 downloads", { exact: true })).toHaveCount(
			0,
		);
	} finally {
		await admin.dispose();
	}
});

test("QR preview lays out beside the photo, stacks on mobile, and gallery stays open", async ({
	page,
}) => {
	await openPhoto(page);
	const dialog = page.getByRole("dialog", { name: "Photo memory" });
	const qr = dialog.getByRole("region", { name: "Scan to download" });
	const image = dialog.getByRole("img", {
		name: "Full-size baby-shower memory",
	});
	await expect(qr.locator('[data-slot="qr-code-frame"] path')).toBeVisible();
	await expect
		.poll(async () => {
			const photoBox = await image.boundingBox();
			const qrBox = await qr.boundingBox();
			return !!photoBox && !!qrBox && qrBox.x >= photoBox.x + photoBox.width;
		})
		.toBe(true);
	await page.clock.install();
	await page.clock.fastForward(61_000);
	await expect(dialog).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(async () => {
			const photoBox = await image.boundingBox();
			const qrBox = await qr.boundingBox();
			return !!photoBox && !!qrBox && qrBox.y >= photoBox.y + photoBox.height;
		})
		.toBe(true);
	expect(
		await dialog.evaluate(
			(element) => element.scrollWidth <= element.clientWidth,
		),
	).toBe(true);
});

for (const path of ["/", "/gallery"]) {
	test(`photo preview blurs the backdrop and prints only its image on ${path}`, async ({
		page,
	}) => {
		await page.addInitScript(() => {
			window.print = () => {
				const image = document.querySelector("img");
				if (!image) throw new Error("Missing print image");
				window.top?.postMessage(
					{
						type: "preview-print",
						images: [...document.querySelectorAll("img")].map((img) => img.src),
						text: document.body.textContent,
						fit: getComputedStyle(image).objectFit,
					},
					"*",
				);
			};
			if (window === window.top) {
				window.addEventListener("message", (event) => {
					if (event.data?.type === "preview-print") {
						document.body.dataset.previewPrint = JSON.stringify(event.data);
					}
				});
			}
		});
		await openPhoto(page, path);
		const dialog = page.getByRole("dialog", { name: "Photo memory" });
		await expect(
			page.locator('[data-slot="dialog-overlay"]:visible'),
		).toHaveCSS("backdrop-filter", "blur(12px)");
		const share = dialog.getByRole("button", { name: "Share to socials" });
		const print = dialog.getByRole("button", { name: "Print", exact: true });
		await expect(share).toBeVisible();
		await expect(print).toBeEnabled();
		await expect
			.poll(() =>
				dialog.evaluate((element) =>
					element
						.getAnimations()
						.some((animation) => animation.playState === "running"),
				),
			)
			.toBe(false);
		const shareBox = await share.boundingBox();
		const printBox = await print.boundingBox();
		if (!shareBox || !printBox) throw new Error("Missing preview actions");
		expect(printBox.y).toBe(shareBox.y);
		expect(printBox.x).toBeGreaterThan(shareBox.x);
		await print.click();
		await expect
			.poll(() => page.locator("body").getAttribute("data-preview-print"))
			.toContain(name);
		const result = await page
			.locator("body")
			.getAttribute("data-preview-print");
		if (!result) throw new Error("Missing print result");
		const printed = JSON.parse(result);
		expect(printed.images).toHaveLength(1);
		expect(printed.images[0]).toContain(name);
		expect(printed.text).not.toContain("Share");
		expect(printed.text).not.toContain("Print");
		expect(printed.fit).toBe("contain");
		await expect(dialog).toBeVisible();

		await page.route("**/storage/v1/object/sign/photos/**", (route) =>
			route.fulfill({ status: 404 }),
		);
		await page.reload();
		await page.getByRole("button", { name: `Open photo ${name}` }).click();
		await expect(
			dialog.getByRole("button", { name: "Print", exact: true }),
		).toBeDisabled();
		await expect(dialog.getByRole("alert")).toContainText("Image unavailable");
	});
}

async function mockNative(
	page: Page,
	mode: "native" | "abort" | "blocked-once" | "unsupported",
) {
	await page.addInitScript((mode) => {
		Object.defineProperties(navigator, {
			canShare: {
				configurable: true,
				value: ({ files }: ShareData) => {
					sessionStorage.setItem(
						"can-share-files",
						String(files?.length === 1 && files[0] instanceof File),
					);
					return mode !== "unsupported";
				},
			},
			share: {
				configurable: true,
				value: async ({ files, title, url }: ShareData) => {
					const calls = Number(sessionStorage.getItem("share-calls")) + 1;
					sessionStorage.setItem("share-calls", String(calls));
					if (mode === "abort")
						throw new DOMException("Cancelled", "AbortError");
					if (mode === "blocked-once" && calls === 1) {
						throw new DOMException("Activation expired", "NotAllowedError");
					}
					const file = files?.[0];
					if (!file) throw new Error("Missing shared file");
					const active = navigator.userActivation.isActive;
					sessionStorage.setItem(
						"shared-file",
						JSON.stringify({
							title,
							url,
							active,
							name: file.name,
							type: file.type,
							bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
						}),
					);
				},
			},
		});
	}, mode);
}

test("authorized galleries issue anonymous expiring share pages with absolute social metadata", async ({
	request,
	page,
	playwright,
	backend,
}) => {
	const listing = await (await request.get("/api/photos")).json();
	expect(listing.photos).toHaveLength(1);
	expect(listing.photos[0].name).toBe(name);
	const shareUrl: string = listing.photos[0].shareUrl;
	const id = new URL(shareUrl).pathname.split("/").pop();
	expect(id).toBeTruthy();
	const payload = Buffer.from(id?.split(".")[0] ?? "", "base64url").toString();
	const expires = Number(payload.split(":")[0]);
	expect(expires - Date.now() / 1000).toBeGreaterThan(7 * 86400 - 60);
	expect(expires - Date.now() / 1000).toBeLessThanOrEqual(7 * 86400);
	await page.context().clearCookies();
	await page.goto(shareUrl);
	await expect(
		page.getByRole("heading", { name: "Nugget Photo Booth memory" }),
	).toBeVisible();
	await expect(
		page.getByRole("img", { name: "Nugget Photo Booth memory" }),
	).toBeVisible();
	await expect(
		page.getByRole("img", { name: "Nugget Photo Booth memory" }),
	).toHaveJSProperty("naturalWidth", 1);
	expect(backend.photoDownloads).toBe(1);
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
		"content",
		"Nugget Photo Booth memory",
	);
	await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
		"content",
		shareUrl,
	);
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		"content",
		`${shareUrl}/image`,
	);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		"content",
		"summary_large_image",
	);
	await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
		"content",
		`${shareUrl}/image`,
	);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
		"content",
		/noindex/,
	);
	const anonymous = await playwright.request.newContext({
		storageState: { cookies: [], origins: [] },
	});
	try {
		const image = await anonymous.get(`${shareUrl}/image`);
		expect(image.ok()).toBe(true);
		expect(image.headers()["content-type"]).toBe("image/png");
		expect(image.headers()["cache-control"]).toContain("no-store");
		expect(await image.body()).toEqual(png);
		expect(backend.photoDownloads).toBe(2);
		const crawler = await anonymous.get(shareUrl, {
			headers: { "user-agent": "facebookexternalhit/1.1" },
		});
		expect(crawler.ok()).toBe(true);
		const html = await crawler.text();
		expect(html).toContain(`property="og:image" content="${shareUrl}/image"`);
		expect(html).not.toContain("test-service-key");
		expect(html).not.toContain("http://127.0.0.1:9999");
	} finally {
		await anonymous.dispose();
	}
});

test("tampered, expired, missing and deleted shares cannot read private photos", async ({
	request,
	backend,
	playwright,
}) => {
	const { photos } = await (await request.get("/api/photos")).json();
	const url: string = photos[0].shareUrl;
	const id = new URL(url).pathname.split("/").pop() ?? "";
	const [payload, signature] = id.split(".");
	const decoded = Buffer.from(payload, "base64url").toString();
	const renamed = Buffer.from(decoded.replace(name, otherName)).toString(
		"base64url",
	);
	const expiredPayload = Buffer.from(
		`${Math.floor(Date.now() / 1000) - 1}:${name}`,
	).toString("base64url");
	const expiredSignature = createHmac("sha256", "test-service-key")
		.update(`photo-share:v1:${expiredPayload}`)
		.digest("base64url");
	const anonymous = await playwright.request.newContext({
		baseURL: "http://127.0.0.1:3210",
		storageState: { cookies: [], origins: [] },
	});
	try {
		backend.storageError = 503;
		for (const invalid of [
			"not-a-token",
			name.split("/")[0],
			`${renamed}.${signature}`,
			`${expiredPayload}.${expiredSignature}`,
			`${id}.extra`,
		]) {
			const response = await anonymous.get(`/share/${invalid}/image`);
			expect(response.status()).toBe(404);
			expect(
				(await anonymous.post(`/share/${invalid}/download`)).status(),
			).toBe(404);
		}
		const page = await anonymous.get("/share/not-a-token", {
			headers: { "user-agent": "facebookexternalhit/1.1" },
		});
		expect(page.status()).toBe(404);
		backend.storageError = null;
		expect((await anonymous.get(`${url}/image`)).status()).toBe(200);
		expect(
			(
				await request.delete(`/api/photos?name=${encodeURIComponent(name)}`)
			).ok(),
		).toBe(true);
		expect((await anonymous.get(`${url}/image`)).status()).toBe(404);
		expect((await anonymous.post(`${url}/download`)).status()).toBe(404);
		expect(
			(await backend.db.query("select * from public.photo_download_counts"))
				.rows,
		).toEqual([]);
		expect(backend.objects.has(otherName)).toBe(true);
	} finally {
		await anonymous.dispose();
	}
});

test("share issuance stays behind the existing user and admin gallery authorization", async ({
	request,
	playwright,
}) => {
	const context = await playwright.request.newContext({
		baseURL: "http://127.0.0.1:3210",
		storageState: { cookies: [sessionCookie(otherId)], origins: [] },
	});
	try {
		const mine = await (await request.get("/api/photos")).json();
		const theirs = await (await context.get("/api/photos")).json();
		expect(mine.photos.map((photo: { name: string }) => photo.name)).toEqual([
			name,
		]);
		expect(theirs.photos.map((photo: { name: string }) => photo.name)).toEqual([
			otherName,
		]);
		const admin = await playwright.request.newContext({
			baseURL: "http://127.0.0.1:3210",
			storageState: { cookies: [sessionCookie(adminId)], origins: [] },
		});
		try {
			const all = await (await admin.get("/api/photos")).json();
			expect(
				all.photos.map((photo: { name: string }) => photo.name).sort(),
			).toEqual([name, otherName].sort());
		} finally {
			await admin.dispose();
		}
		const anonymous = await playwright.request.newContext({
			baseURL: "http://127.0.0.1:3210",
			storageState: { cookies: [], origins: [] },
		});
		try {
			expect((await anonymous.get("/api/photos")).status()).toBe(401);
			expect(
				(
					await anonymous.get(`/share/${encodeURIComponent(otherName)}/image`)
				).status(),
			).toBe(404);
		} finally {
			await anonymous.dispose();
		}
	} finally {
		await context.dispose();
	}
});

test("share image reports storage outages without treating them as missing photos", async ({
	request,
	backend,
	page,
}) => {
	const { photos } = await (await request.get("/api/photos")).json();
	backend.storageError = 503;
	const response = await request.get(`${photos[0].shareUrl}/image`);
	expect(response.status()).toBe(503);
	expect(await response.text()).toContain("Please try again");
	expect(response.headers()["cache-control"]).toContain("no-store");
	await page.context().clearCookies();
	await page.goto(photos[0].shareUrl);
	await expect(
		page.getByRole("heading", { name: "Could not load this photo" }),
	).toBeVisible();
	backend.storageError = null;
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Nugget Photo Booth memory" }),
	).toBeVisible();
});

test("image dialog shares a File from a user click without opening the fallback", async ({
	page,
	backend,
}) => {
	await mockNative(page, "native");
	await openPhoto(page, "/");
	const share = page.getByRole("button", { name: "Share to socials" });
	const image = page.getByRole("img", { name: "Full-size baby-shower memory" });
	const shareBox = await share.boundingBox();
	const imageBox = await image.boundingBox();
	expect(shareBox && imageBox && shareBox.y < imageBox.y).toBe(true);
	await share.click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("shared-file")))
		.toBeTruthy();
	const result = await page.evaluate(() =>
		JSON.parse(sessionStorage.getItem("shared-file") ?? "{}"),
	);
	expect(result.bytes).toEqual([...png]);
	expect(result.type).toBe("image/png");
	expect(result.name).toBe("photo-memory.png");
	expect(result.title).toBe("Nugget Photo Booth memory");
	expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:3210\/share\//);
	expect(result.active).toBe(true);
	expect(
		await page.evaluate(() => sessionStorage.getItem("can-share-files")),
	).toBe("true");
	await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
	await expect(share).toBeEnabled();
	expect(
		(await backend.db.query("select * from public.photo_download_counts")).rows,
	).toEqual([]);
});

test("native share cancellation is ignored", async ({ page }) => {
	await mockNative(page, "abort");
	await openPhoto(page);
	const share = page.getByRole("button", { name: "Share to socials" });
	await share.click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("share-calls")))
		.toBe("1");
	await expect(share).toBeEnabled();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
});

test("unsupported file sharing offers correctly encoded social links, copy toast and image download", async ({
	page,
	backend,
}) => {
	await mockNative(page, "unsupported");
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await openPhoto(page);
	await page.getByRole("button", { name: "Share to socials" }).click();
	const popover = page.locator('[data-slot="popover-content"]');
	await expect(popover).toBeVisible();
	const facebook = new URL(
		(await popover
			.getByRole("link", { name: "Facebook" })
			.getAttribute("href")) ?? "",
	);
	const publicUrl = facebook.searchParams.get("u");
	expect(publicUrl).toMatch(/^http:\/\/127\.0\.0\.1:3210\/share\//);
	for (const label of ["Facebook", "X", "WhatsApp"]) {
		const link = popover.getByRole("link", { name: label, exact: true });
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	}
	const x = new URL(
		(await popover
			.getByRole("link", { name: "X", exact: true })
			.getAttribute("href")) ?? "",
	);
	expect(x.searchParams.get("url")).toBe(publicUrl);
	expect(x.searchParams.get("text")).toBe("Nugget Photo Booth memory");
	const whatsApp = new URL(
		(await popover
			.getByRole("link", { name: "WhatsApp" })
			.getAttribute("href")) ?? "",
	);
	expect(whatsApp.searchParams.get("text")).toBe(
		`Nugget Photo Booth memory ${publicUrl}`,
	);
	await popover.getByRole("button", { name: "Copy link" }).click();
	await expect(page.getByText("Copied", { exact: true })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		publicUrl,
	);
	const downloaded = page.waitForEvent("download");
	await popover.getByRole("button", { name: "Download image" }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toBe("photo-memory.png");
	expect(await download.failure()).toBeNull();
	const secondDownload = page.waitForEvent("download");
	await popover.getByRole("button", { name: "Download image" }).click();
	await secondDownload;
	expect(
		(
			await backend.db.query(
				"select download_count from public.photo_download_counts",
			)
		).rows,
	).toEqual([{ download_count: 2 }]);
	expect(
		await page.evaluate(() => sessionStorage.getItem("share-calls")),
	).toBeNull();
});

test("missing Web Share API falls back without fetching the image", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		Object.defineProperties(navigator, {
			share: { value: undefined, configurable: true },
			canShare: { value: undefined, configurable: true },
		});
	});
	await openPhoto(page);
	let imageFetches = 0;
	await page.route("**/share/*/image", (route) => {
		imageFetches++;
		return route.abort();
	});
	await page.getByRole("button", { name: "Share to socials" }).click();
	await expect(page.getByRole("link", { name: "Facebook" })).toBeVisible();
	expect(imageFetches).toBe(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});

test("loading and failed image fetches show recovery instead of calling native share", async ({
	page,
}) => {
	await mockNative(page, "native");
	await openPhoto(page);
	let release = () => {};
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/share/*/image", async (route) => {
		await blocked;
		await route.fulfill({ status: 503, body: "Temporary failure" });
	});
	const share = page.getByRole("button", { name: "Share to socials" });
	await share.click();
	await expect(share).toBeDisabled();
	await expect(share).toHaveAttribute("aria-busy", "true");
	await expect(share).toHaveText("Preparing...");
	release();
	await expect(page.getByRole("alert")).toContainText(
		"Could not share this photo",
	);
	await expect(share).toBeEnabled();
	await expect(page.getByRole("link", { name: "Facebook" })).toBeVisible();
	expect(
		await page.evaluate(() => sessionStorage.getItem("share-calls")),
	).toBeNull();
});

test("blocked native sharing can retry the prepared file without another image fetch", async ({
	page,
}) => {
	await mockNative(page, "blocked-once");
	await openPhoto(page);
	let imageFetches = 0;
	await page.route("**/share/*/image", async (route) => {
		imageFetches++;
		await route.continue();
	});
	const share = page.getByRole("button", { name: "Share to socials" });
	await share.click();
	await expect(page.getByRole("alert")).toContainText("Tap Share again");
	await page.keyboard.press("Escape");
	await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Photo memory" }),
	).toBeVisible();
	await share.click();
	await expect
		.poll(() => page.evaluate(() => sessionStorage.getItem("shared-file")))
		.toBeTruthy();
	expect(imageFetches).toBe(1);
});

test("clipboard failures stay visible and offer other sharing choices", async ({
	page,
}) => {
	await mockNative(page, "unsupported");
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async () => {
					throw new DOMException("Denied", "NotAllowedError");
				},
			},
		});
	});
	await openPhoto(page);
	await page.getByRole("button", { name: "Share to socials" }).click();
	await page.getByRole("button", { name: "Copy link" }).click();
	await expect(page.getByRole("alert")).toContainText("clipboard");
	await expect(page.getByRole("link", { name: "Facebook" })).toBeVisible();
	await expect(
		page
			.locator('[data-slot="popover-content"]')
			.getByRole("button", { name: "Download image" }),
	).toBeEnabled();
});
