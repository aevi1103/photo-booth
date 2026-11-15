import { expect, test } from "./fixtures";

test("automatic capture waits for a face and cancels only the first countdown", async ({
	page,
}) => {
	test.slow();
	await page.addInitScript(() => {
		const source = document.createElement("canvas");
		source.width = 600;
		source.height = 650;
		const context = source.getContext("2d");
		if (!context) throw new Error("Could not create test camera.");
		const image = new Image();
		image.src = "/images/portait.jpeg";
		Object.assign(window, { showTestFace: false });
		navigator.mediaDevices.getUserMedia = async () => {
			await image.decode();
			const paint = () => {
				context.fillStyle = "#00ff00";
				context.fillRect(0, 0, source.width, source.height);
				if ((window as Window & { showTestFace?: boolean }).showTestFace)
					context.drawImage(image, 1020, 450, 600, 650, 0, 0, 600, 650);
				requestAnimationFrame(paint);
			};
			paint();
			return source.captureStream(10);
		};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(page.getByText("Waiting for a face.")).toBeVisible({
		timeout: 20_000,
	});
	await page.waitForTimeout(5_500);
	await expect(page.getByText("Photo 1 of 3")).toHaveCount(0);

	await page.evaluate(() => Object.assign(window, { showTestFace: true }));
	await expect(
		page.getByText("Face detected. Hold still for 5 seconds."),
	).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.getByText("Photo 1 of 3")).toBeVisible({
		timeout: 15_000,
	});
	await page.evaluate(() => Object.assign(window, { showTestFace: false }));
	await expect(page.getByText("Photo 1 of 3")).toHaveCount(0);
	await expect(page.getByText("Waiting for a face.")).toBeVisible();

	await page.evaluate(() => Object.assign(window, { showTestFace: true }));
	await expect(page.getByText("Photo 1 of 3")).toBeVisible({
		timeout: 15_000,
	});
	const toggle = page.getByRole("button", { name: "Automatic capture" });
	await toggle.click();
	await expect(page.getByText("Photo 1 of 3")).toHaveCount(0);
	await toggle.click();
	await expect(page.getByText("Photo 2 of 3")).toBeVisible({
		timeout: 25_000,
	});
	await page.evaluate(() => Object.assign(window, { showTestFace: false }));
	await expect(page.getByRole("button", { name: "Save photo" })).toBeVisible({
		timeout: 20_000,
	});
});

test("automatic capture is on by default and its toggle is remembered", async ({
	page,
}) => {
	await page.goto("/");
	const toggle = page.getByRole("button", { name: "Automatic capture" });
	await expect(
		page
			.locator(".preview-heading")
			.getByRole("button", { name: "Automatic capture" }),
	).toBeVisible();
	await expect(toggle).toHaveText("Auto capture: On");
	await expect(toggle).toHaveAttribute("aria-pressed", "true");
	await toggle.click();
	await expect(toggle).toHaveText("Auto capture: Off");
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await page.reload();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByText("Automatic capture is off.")).toBeVisible();
});

test("automatic capture remains available in photo mode", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await page.getByRole("button", { name: "Photo mode" }).click();
	const toggle = page.getByRole("button", { name: "Automatic capture" });
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await page.getByRole("button", { name: "Close photo mode" }).click();
	await expect(
		page
			.locator(".preview-heading")
			.getByRole("button", { name: "Automatic capture" }),
	).toHaveText("Auto capture: Off");
});

test("manual capture still works if the face model cannot load", async ({
	page,
}) => {
	await page.route("**/models/blaze_face_short_range.tflite", (route) =>
		route.fulfill({ status: 404 }),
	);
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page
			.getByRole("alert")
			.filter({ hasText: "Automatic capture is unavailable" }),
	).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: "Take a photo" }).click();
	await expect(page.getByText("Photo 1 of 3")).toBeVisible();
});

test("automatic capture stays inactive when the upload allowance is exhausted", async ({
	page,
}) => {
	let modelRequests = 0;
	page.on("request", (request) => {
		if (request.url().endsWith("/models/blaze_face_short_range.tflite"))
			modelRequests++;
	});
	await page.route("**/api/account", (route) =>
		route.fulfill({
			json: { quota: { role: "user", used: 20, limit: 20, remaining: 0 } },
		}),
	);
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await page.waitForTimeout(1_000);
	expect(modelRequests).toBe(0);
});
