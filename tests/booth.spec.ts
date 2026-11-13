import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { adminId, expect, sessionCookie, test } from "./fixtures";

async function mockFrame(
	page: Page,
	width: number,
	height: number,
	kind: "opening" | "opaque" | "transparent" = "opening",
) {
	const opening =
		kind === "opening"
			? {
					x: Math.floor(width * 0.55),
					y: Math.floor(height * 0.15),
					width: Math.floor(width * 0.35),
					height: Math.floor(height * 0.7),
				}
			: { x: 0, y: 0, width, height };
	const png = await page.evaluate(
		({ width, height, opening, kind }) => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d")!;
			if (kind !== "transparent") {
				context.fillStyle = "#0040c8";
				context.fillRect(0, 0, width, height);
			}
			if (kind === "opening") {
				context.clearRect(opening.x, opening.y, opening.width, opening.height);
				context.clearRect(0, 0, width, 4);
				context.clearRect(0, 0, 4, height);
				context.clearRect(20, 20, 4, 4);
				context.fillStyle = "rgba(255, 255, 0, 0.5)";
				context.fillRect(opening.x + 5, opening.y + 5, 15, 15);
				context.fillStyle = "#0040c8";
				context.fillRect(opening.x + 25, opening.y + 5, 10, 15);
			}
			return canvas.toDataURL("image/png").split(",")[1];
		},
		{ width, height, opening, kind },
	);
	await page.route("**/frames/*.png", (route) =>
		route.fulfill({
			contentType: "image/png",
			body: Buffer.from(png, "base64"),
		}),
	);
	return opening;
}

async function compositionMatches(
	page: Page,
	opening: { x: number; y: number; width: number; height: number },
	mirror = false,
	captured = false,
) {
	return page.evaluate(
		async ({ opening, mirror, captured }) => {
			const source = document.querySelector("canvas");
			const video = document.querySelector("video");
			if (!source || !video || !video.videoWidth) return false;
			const expected = document.createElement("canvas");
			expected.width = source.width;
			expected.height = source.height;
			const context = expected.getContext("2d")!;
			context.fillStyle = "rgb(218, 237, 247)";
			context.fillRect(0, 0, expected.width, expected.height);
			const scale = Math.max(
				opening.width / video.videoWidth,
				opening.height / video.videoHeight,
			);
			context.save();
			context.beginPath();
			context.rect(opening.x, opening.y, opening.width, opening.height);
			context.clip();
			context.translate(
				opening.x + opening.width / 2,
				opening.y + opening.height / 2,
			);
			if (mirror) context.scale(-1, 1);
			context.drawImage(
				video,
				(-video.videoWidth * scale) / 2,
				(-video.videoHeight * scale) / 2,
				video.videoWidth * scale,
				video.videoHeight * scale,
			);
			context.restore();
			const frame = new Image();
			frame.src = document
				.querySelector(".background-option.selected img")!
				.getAttribute("src")!;
			await frame.decode();
			context.drawImage(frame, 0, 0);
			const actual = document.createElement("canvas");
			actual.width = source.width;
			actual.height = source.height;
			const actualContext = actual.getContext("2d")!;
			const photo = document.querySelector<HTMLImageElement>(".preview img");
			if (captured && (!photo || !photo.complete)) return false;
			actualContext.drawImage(captured ? photo! : source, 0, 0);
			const points = [
				[10, 10],
				[22, 22],
				[2, expected.height / 2],
				[opening.x + 10, opening.y + 10],
				[opening.x + 30, opening.y + 10],
				...[0.15, 0.35, 0.65, 0.85].map((x) => [
					opening.x + opening.width * x,
					opening.y + opening.height * 0.6,
				]),
			];
			return points.every(([x, y]) => {
				const desired = context.getImageData(
					Math.floor(x),
					Math.floor(y),
					1,
					1,
				).data;
				const actual = actualContext.getImageData(
					Math.floor(x),
					Math.floor(y),
					1,
					1,
				).data;
				return desired
					.slice(0, 3)
					.every(
						(value, index) =>
							Math.abs(value - actual[index]) < (captured ? 30 : 4),
					);
			});
		},
		{ opening, mirror, captured },
	);
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const audioEvents: {
			kind: string;
			time: number;
			frequency?: number;
			duration?: number;
			hasSignal?: boolean;
		}[] = [];
		Object.assign(window, { boothAudioEvents: audioEvents });
		const oscillator = AudioContext.prototype.createOscillator;
		AudioContext.prototype.createOscillator = function () {
			const source = oscillator.call(this);
			let frequency = source.frequency.value;
			const setFrequency = source.frequency.setValueAtTime.bind(
				source.frequency,
			);
			source.frequency.setValueAtTime = (value, time) => {
				frequency = value;
				return setFrequency(value, time);
			};
			const start = source.start.bind(source);
			source.start = (when = 0) => {
				audioEvents.push({
					kind: "countdown",
					time: performance.now(),
					frequency,
				});
				start(when);
			};
			return source;
		};
		const bufferSource = AudioContext.prototype.createBufferSource;
		AudioContext.prototype.createBufferSource = function () {
			const source = bufferSource.call(this);
			const start = source.start.bind(source);
			source.start = (when = 0) => {
				audioEvents.push({
					kind: "shutter",
					time: performance.now(),
					duration: source.buffer?.duration,
					hasSignal: source.buffer
						?.getChannelData(0)
						.some((sample) => sample !== 0),
				});
				start(when);
			};
			return source;
		};
		const source = document.createElement("canvas");
		source.width = 320;
		source.height = 180;
		const context = source.getContext("2d")!;
		navigator.mediaDevices.getUserMedia = async () => {
			const stream = source.captureStream(10);
			const paint = () => {
				context.fillStyle = "#00ff00";
				context.fillRect(0, 0, 160, 180);
				context.fillStyle = "#ff0000";
				context.fillRect(160, 0, 160, 180);
				requestAnimationFrame(paint);
			};
			paint();
			return stream;
		};
	});
});

test("booth background moves gently and respects reduced motion", async ({
	page,
}) => {
	await page.goto("/");
	const background = () =>
		page.locator(".booth-shell").evaluate((shell) => {
			const style = getComputedStyle(shell, "::after");
			return {
				animation: style.animationName,
				pointerEvents: style.pointerEvents,
			};
		});
	expect(await background()).toEqual({
		animation: "booth-cloud-drift",
		pointerEvents: "none",
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	expect((await background()).animation).toBe("none");
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 },
]) {
	test(`mobile camera switching, framed capture, and upload at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.addInitScript(() => {
			const state = {
				constraints: [] as MediaStreamConstraints[],
				tracks: [] as MediaStreamTrack[],
			};
			Object.assign(window, { mobileCameraTest: state });
			navigator.mediaDevices.getUserMedia = async (constraints) => {
				state.constraints.push(constraints ?? {});
				const source = document.createElement("canvas");
				source.width = 180;
				source.height = 320;
				const context = source.getContext("2d")!;
				context.fillStyle = "#ff0000";
				context.fillRect(0, 0, source.width, source.height);
				const stream = source.captureStream(10);
				state.tracks.push(stream.getVideoTracks()[0]);
				return stream;
			};
		});
		await page.route("**/api/photos", (route) =>
			route.fulfill({ json: { saved: true } }),
		);
		await page.goto("/");
		// Quota text renders client-side, so it guarantees hydration before interacting.
		await expect(
			page.getByText("20 of 20 photo uploads remaining"),
		).toBeVisible();
		const cameraPicker = page.getByRole("combobox", {
			name: "Camera device",
		});
		await cameraPicker.click();
		await page.getByRole("option", { name: "Front camera (selfie)" }).click();
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
		await cameraPicker.click();
		await page.getByRole("option", { name: "Rear camera" }).click();
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		const captureButton = await page
			.getByRole("button", { name: "Take a photo" })
			.boundingBox();
		const voiceButton = await page
			.getByRole("button", { name: "Enable voice capture" })
			.boundingBox();
		expect(captureButton).not.toBeNull();
		expect(voiceButton).not.toBeNull();
		expect(captureButton!.y).toBe(voiceButton!.y);
		const state = await page.evaluate(() => {
			const state = (
				window as Window & {
					mobileCameraTest?: {
						constraints: MediaStreamConstraints[];
						tracks: MediaStreamTrack[];
					};
				}
			).mobileCameraTest;
			if (!state) throw new Error("Mobile camera test state is missing.");
			return {
				constraints: state.constraints,
				previousTracks: state.tracks
					.slice(0, -1)
					.map((track) => track.readyState),
				liveTrack: state.tracks.at(-1)?.readyState,
			};
		});
		const facingModes = state.constraints.map((constraints) => {
			if (typeof constraints.video !== "object")
				throw new Error("Missing camera constraints.");
			return constraints.video.facingMode;
		});
		expect(
			facingModes.filter(
				(mode, index) =>
					index === 0 ||
					JSON.stringify(mode) !== JSON.stringify(facingModes[index - 1]),
			),
		).toEqual([{ exact: "user" }, { exact: "environment" }]);
		expect(state.constraints.every((constraints) => !constraints.audio)).toBe(
			true,
		);
		expect(state.previousTracks.length).toBeGreaterThan(0);
		expect(
			state.previousTracks.every((readyState) => readyState === "ended"),
		).toBe(true);
		expect(state.liveTrack).toBe("live");
		const video = page.locator("video");
		await expect(video).toHaveAttribute("playsinline", "");
		await expect(video).not.toHaveCSS("display", "none");
		await expect
			.poll(() =>
				page
					.locator("canvas")
					.evaluate((canvas: HTMLCanvasElement) => canvas.width),
			)
			.toBe(1153);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		await page.getByRole("button", { name: "Take a photo" }).click();
		await expect(
			page.getByRole("combobox", { name: "Camera device" }),
		).toBeDisabled();
		await expect(page.getByAltText("A moment at the baby shower")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("Saved privately for the host.")).toBeVisible();
		const dimensions = await page
			.getByAltText("A moment at the baby shower")
			.evaluate((image: HTMLImageElement) => ({
				width: image.naturalWidth,
				height: image.naturalHeight,
			}));
		expect(dimensions).toEqual({ width: 1153, height: 768 });
	});
}

for (const [width, height] of [
	[320, 480],
	[480, 320],
	[400, 400],
]) {
	test(`frame geometry ${width}x${height} preserves native output and crops to the transparent opening`, async ({
		page,
	}) => {
		const opening = await mockFrame(page, width, height);
		await page.addInitScript(() => {
			navigator.mediaDevices.getUserMedia = async () => {
				const source = document.createElement("canvas");
				source.width = 320;
				source.height = 180;
				const context = source.getContext("2d")!;
				const image = context.createImageData(source.width, source.height);
				for (let y = 0; y < source.height; y++) {
					for (let x = 0; x < source.width; x++) {
						const index = (y * source.width + x) * 4;
						image.data[index] = (x * 255) / (source.width - 1);
						image.data[index + 1] = (y * 255) / (source.height - 1);
						image.data[index + 2] = 110;
						image.data[index + 3] = 255;
					}
				}
				context.putImageData(image, 0, 0);
				return source.captureStream(10);
			};
		});
		await page.route("**/api/photos", (route) =>
			route.fulfill({ json: { saved: true } }),
		);
		await page.goto("/");
		await expect(
			page.getByRole("button", { name: "Connect", exact: true }),
		).toBeEnabled();
		await expect(page.locator("video")).toHaveCount(0);
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await expect
			.poll(() =>
				page
					.locator("canvas")
					.evaluate((canvas: HTMLCanvasElement) => [
						canvas.width,
						canvas.height,
					]),
			)
			.toEqual([width, height]);
		const bounds = await page.locator(".preview").boundingBox();
		expect(bounds!.width / bounds!.height).toBeCloseTo(width / height, 2);
		await expect.poll(() => compositionMatches(page, opening)).toBe(true);
		await page.getByRole("button", { name: "Take a photo" }).click();
		const photo = page.getByAltText("A moment at the baby shower");
		await expect(photo).toBeVisible({ timeout: 10_000 });
		expect(
			await photo.evaluate((image: HTMLImageElement) => [
				image.naturalWidth,
				image.naturalHeight,
			]),
		).toEqual([width, height]);
		expect(await compositionMatches(page, opening, false, true)).toBe(true);
	});
}

test("frame orientation switches without reconnecting and portrait photo mode contains the entire frame on mobile", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const original = await page
		.locator("video")
		.evaluateHandle((video: HTMLVideoElement) => video.srcObject);
	await mockFrame(page, 320, 480);
	await page.getByRole("button", { name: "baby shower", exact: true }).click();
	await expect
		.poll(() =>
			page
				.locator("canvas")
				.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
		)
		.toEqual([320, 480]);
	expect(
		await page
			.locator("video")
			.evaluate(
				(video: HTMLVideoElement, stream) => video.srcObject === stream,
				original,
			),
	).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	await page.getByRole("button", { name: "Photo mode" }).click();
	await expect(page.locator(".preview canvas")).toHaveCSS(
		"object-fit",
		"contain",
	);
	await expect
		.poll(() =>
			page
				.locator("canvas")
				.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
		)
		.toEqual([320, 480]);
	await page.keyboard.press("Escape");
	const bounds = await page.locator(".preview").boundingBox();
	expect(bounds!.width / bounds!.height).toBeCloseTo(2 / 3, 2);
});

for (const kind of ["opaque", "transparent"] as const) {
	test(`${kind} frames retain their native shape and expected composition`, async ({
		page,
	}) => {
		const opening = await mockFrame(page, 320, 480, kind);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await expect.poll(() => compositionMatches(page, opening)).toBe(true);
		expect(
			await page
				.locator("canvas")
				.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
		).toEqual([320, 480]);
	});
}

test("frame load failures block capture and selecting a working frame recovers", async ({
	page,
}) => {
	await page.route("**/frames/baby-shower.png", (route) => route.abort());
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "baby shower", exact: true }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load that frame" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await page
		.getByRole("button", { name: "baby shower backup", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load that frame" }),
	).toHaveCount(0);
});

test("booth persists preferences locally but not the active camera session", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await expect(
		page.getByText("20 of 20 photo uploads remaining"),
	).toBeVisible();
	const camera = page.getByRole("combobox", { name: "Camera device" });
	await camera.click();
	await page.getByRole("option", { name: "Front camera (selfie)" }).click();
	await expect(camera).toHaveValue("Front camera (selfie)");
	await page.locator(".background-option").nth(1).click();
	await expect
		.poll(() =>
			page.evaluate(
				() => localStorage.getItem("photo-booth-preferences") ?? "",
			),
		)
		.toContain('"deviceId":"facing:user"');
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();

	await page.reload();

	await expect(
		page.getByRole("combobox", { name: "Camera device" }),
	).toHaveValue("Front camera (selfie)");
	await expect(page.locator(".background-option").nth(1)).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
});

test("a late frame load cannot replace a newer selection", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	let release: () => void = () => {
		throw new Error("The delayed frame request has not started.");
	};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested = false;
	await page.route("**/frames/baby-shower.png", async (route) => {
		requested = true;
		await pending;
		await route.fulfill({
			contentType: "image/png",
			body: await readFile("public\\frames\\baby-shower.png"),
		});
	});
	await page.getByRole("button", { name: "baby shower", exact: true }).click();
	await expect.poll(() => requested).toBe(true);
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await page
		.getByRole("button", { name: "baby shower backup", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const response = page.waitForResponse((response) =>
		response.url().endsWith("/frames/baby-shower.png"),
	);
	release();
	await response;
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	expect(
		await page
			.locator("canvas")
			.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
	).toEqual([1153, 768]);
	await page
		.getByRole("button", { name: "baby shower backup", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
});

test("leaving the booth releases the active webcam track", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const track = await page
		.locator("video")
		.evaluateHandle((video: HTMLVideoElement) => {
			if (!(video.srcObject instanceof MediaStream))
				throw new Error("Missing camera stream.");
			return video.srcObject.getVideoTracks()[0];
		});
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await page.getByRole("link", { name: "View gallery", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Photo gallery" }),
	).toBeVisible();
	expect(await track.evaluate((track) => track.readyState)).toBe("ended");
	await page.getByRole("link", { name: "Back to booth", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
});

test("gallery and login headers start at the top on tall screens", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 1800 });
	for (const path of ["/gallery", "/login"]) {
		await page.goto(path);
		await expect(page.locator(".topbar")).toHaveCSS("position", "sticky");
		const header = await page.locator(".topbar").boundingBox();
		expect(header?.y).toBe(0);
	}
});

test("responsive styles include the original breakpoint widths", async ({
	page,
}) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await page.goto("/");
	await expect(
		page.getByRole("combobox", { name: "Camera device" }),
	).toBeVisible();
	await expect(page.locator("aside.controls-card")).toHaveCount(0);
	await page.setViewportSize({ width: 801, height: 900 });
	await expect(
		page.getByRole("combobox", { name: "Camera device" }),
	).toBeVisible();

	await page.setViewportSize({ width: 480, height: 900 });
	await page.goto("/login");
	await expect(page.locator(".topbar > div")).toHaveCSS("font-size", "19px");
	await page.setViewportSize({ width: 481, height: 900 });
	await expect(page.locator(".topbar > div")).toHaveCSS("font-size", "22px");
});

for (const width of [390, 1920]) {
	test(`full-width booth opens an accessible compact menu at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/");
		await expect(page.locator("header")).toHaveCount(0);
		await expect(page.locator(".booth-toolbar")).toHaveCount(0);
		await expect(page.locator("h1")).toHaveClass("sr-only");
		await expect(page.locator(".quota-status > p").first()).toHaveClass(
			"sr-only",
		);
		await expect(page.locator(".hero")).toHaveCount(0);
		const shell = await page.locator(".capture-shell").boundingBox();
		expect(shell?.width).toBe(width);
		const grid = await page.locator(".booth-grid").boundingBox();
		expect(grid!.width).toBeGreaterThanOrEqual(width - 64);
		const menu = page
			.locator(".preview-heading")
			.getByRole("button", { name: "Menu", exact: true });
		await expect(page.getByRole("link", { name: "View gallery" })).toBeHidden();
		await menu.click();
		const dialog = page.getByRole("dialog", { name: "Menu", exact: true });
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByRole("link", { name: "View gallery" }),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Sign out" }),
		).toBeVisible();
		await expect(
			dialog.getByRole("link", { name: "Manage backdrops" }),
		).toHaveCount(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(menu).toBeFocused();
		await menu.click();
		await dialog.getByRole("button", { name: "Close", exact: true }).click();
		await expect(dialog).toBeHidden();
		await menu.click();
		await dialog.getByRole("link", { name: "View gallery" }).click();
		await expect(
			page.getByRole("heading", { name: "Photo gallery" }),
		).toBeVisible();
		await expect(dialog).toBeHidden();
	});
}

test("mobile puts booth first with camera and menu controls in the preview", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await expect(page.locator(".hero")).toHaveCount(0);
	await expect(page.locator("aside.controls-card")).toHaveCount(0);
	await expect(
		page.getByRole("combobox", { name: "Camera device" }),
	).toBeVisible();
	await expect(page.locator(".booth-preview")).toHaveCSS(
		"border-top-width",
		"0px",
	);
	await expect(page.locator(".booth-preview")).toHaveCSS("padding-left", "0px");
	await expect(page.locator(".booth-preview")).toHaveCSS("box-shadow", "none");
	const previewWidth = await page
		.locator(".preview")
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(previewWidth).toBeGreaterThanOrEqual(350);
	await expect(
		page.getByText("A few little details", { exact: true }),
	).toHaveCount(0);
	const buttons = await page
		.locator(".actions")
		.evaluate((actions) =>
			Array.from(actions.querySelectorAll("button")).map(
				(button) => button.getBoundingClientRect().y,
			),
		);
	expect(buttons).toHaveLength(2);
	expect(buttons[0]).toBe(buttons[1]);
	const photoMode = await page
		.getByRole("button", { name: "Photo mode" })
		.boundingBox();
	const menu = await page
		.getByRole("button", { name: "Menu", exact: true })
		.boundingBox();
	expect(menu!.x).toBeGreaterThanOrEqual(photoMode!.x + photoMode!.width - 1);
	expect(
		Math.abs(
			menu!.y + menu!.height / 2 - (photoMode!.y + photoMode!.height / 2),
		),
	).toBeLessThan(3);
	await expect(
		page.getByRole("button", { name: "Enable voice capture" }),
	).toHaveAttribute("aria-pressed", "false");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
});

test("backdrop carousel controls move between frames on mobile", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto("/");

	const carousel = page.getByRole("region", { name: "Choose a frame" });
	await expect(
		carousel.getByRole("button", { name: "Next backdrops" }),
	).toBeEnabled();
	await carousel.getByRole("button", { name: "Next backdrops" }).click();
	await expect(
		carousel.getByRole("button", { name: "Previous backdrops" }),
	).toBeEnabled();
	await carousel.getByRole("button", { name: "Previous backdrops" }).click();
	await expect(
		carousel.getByRole("button", { name: "Previous backdrops" }),
	).toBeDisabled();
});

test("desktop keeps the camera preview dominant with compact surrounding layout", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await expect(
		page.getByText("20 of 20 photo uploads remaining"),
	).toBeVisible();
	const preview = await page.locator(".preview").boundingBox();
	const stage = await page.locator(".preview-stage").boundingBox();
	const picker = await page.locator(".backdrop-picker").boundingBox();
	const camera = await page
		.getByRole("combobox", { name: "Camera device" })
		.boundingBox();
	const photoMode = await page
		.getByRole("button", { name: "Photo mode" })
		.boundingBox();
	expect(stage?.y).toBeLessThan(100);
	expect(stage?.width).toBeGreaterThanOrEqual(650);
	expect(camera!.y).toBeLessThan(picker!.y);
	expect(camera!.y + camera!.height / 2).toBeCloseTo(
		photoMode!.y + photoMode!.height / 2,
		0,
	);
	expect(picker!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width);
	await expect(page.locator(".backdrop-list")).toHaveCSS(
		"flex-direction",
		"column",
	);
	expect(preview).not.toBeNull();
	await expect(page.locator("aside.controls-card")).toHaveCount(0);
	const menu = await page
		.getByRole("button", { name: "Menu", exact: true })
		.boundingBox();
	expect(
		Math.abs(
			menu!.y + menu!.height / 2 - (photoMode!.y + photoMode!.height / 2),
		),
	).toBeLessThan(3);
});

for (const viewport of [
	{ width: 1920, height: 1080 },
	{ width: 1366, height: 768 },
	{ width: 1024, height: 600 },
]) {
	test(`desktop booth fits viewport at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		for (const selector of [
			".booth-preview",
			".preview",
			".backdrop-picker",
			".actions",
		]) {
			const bounds = await page.locator(selector).boundingBox();
			expect(bounds).not.toBeNull();
			expect(bounds!.y).toBeGreaterThanOrEqual(0);
			expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
		}
		expect(
			await page.evaluate(
				() => document.documentElement.scrollHeight <= innerHeight,
			),
		).toBe(true);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		const preview = await page.locator(".preview").boundingBox();
		const heading = await page.locator(".preview-heading").boundingBox();
		expect(heading!.x).toBeCloseTo(preview!.x, 1);
		expect(heading!.width).toBeCloseTo(preview!.width, 1);
		expect(heading!.y + heading!.height).toBeLessThanOrEqual(preview!.y);
		expect(preview!.width / preview!.height).toBeCloseTo(1153 / 768, 2);
		await page.getByRole("button", { name: "Take a photo" }).click();
		await expect(page.getByRole("button", { name: "Retake" })).toBeVisible({
			timeout: 10_000,
		});
		const actions = await page.locator(".actions").boundingBox();
		expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport.height);
		await page.getByRole("button", { name: "Retake" }).click();
		await page.getByRole("button", { name: "Menu", exact: true }).click();
		await expect(
			page.getByRole("dialog", { name: "Menu", exact: true }),
		).toBeVisible();
	});
}

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 390, height: 844 },
]) {
	test(`photo mode fills the screen and exits with Escape or browser back at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(page.getByText("LIVE", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Photo mode" }).click();
		expect(
			await page
				.locator(".booth-shell")
				.evaluate((shell) => getComputedStyle(shell, "::after").display),
		).toBe("none");
		await expect(page.locator(".preview-card")).toHaveCSS(
			"position",
			"absolute",
		);
		await expect(
			page.getByRole("button", { name: "Menu", exact: true }),
		).toBeHidden();
		await expect(page.locator(".hero")).toBeHidden();
		await expect(page.locator(".controls-card")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Enable voice capture" }),
		).toBeVisible();
		const preview = await page.locator(".preview").boundingBox();
		expect(preview?.x).toBe(0);
		expect(preview?.y).toBe(0);
		expect(preview?.width).toBe(viewport.width);
		expect(preview?.height).toBe(viewport.height);
		await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

		const closeButton = page.getByRole("button", { name: "Close photo mode" });
		await closeButton.hover();
		await expect(closeButton).toHaveCSS("color", "rgb(255, 255, 255)");
		await closeButton.click();
		await expect(
			page.getByRole("button", { name: "Photo mode" }),
		).toBeVisible();
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

		await page.getByRole("button", { name: "Photo mode" }).click();
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("button", { name: "Photo mode" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Menu", exact: true }),
		).toBeVisible();
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

		await page.getByRole("button", { name: "Photo mode" }).click();
		await page.evaluate(() => window.history.back());
		await expect(page.locator(".booth-preview")).not.toHaveClass(
			/is-photo-mode/,
		);
		await page.getByRole("button", { name: "Photo mode" }).click();
		await page.getByRole("button", { name: "Take a photo" }).click();
		await expect(page.getByRole("button", { name: "Retake" })).toBeVisible({
			timeout: 10_000,
		});
		await expect(
			page.getByRole("button", { name: "Photo mode" }),
		).toBeVisible();
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
	});
}

for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
	test(`camera ${name} shows recovery instructions and allows retry`, async ({
		page,
	}) => {
		await page.addInitScript((name) => {
			navigator.mediaDevices.getUserMedia = async () => {
				throw new DOMException("Test camera failure", name);
			};
		}, name);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		const text =
			name === "NotAllowedError"
				? "Allow camera access"
				: name === "NotFoundError"
					? "That camera is unavailable"
					: "The camera is busy";
		await expect(
			page.getByRole("alert").filter({ hasText: text }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Connect", exact: true }),
		).toBeEnabled();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeDisabled();
		await page.evaluate(() => {
			navigator.mediaDevices.getUserMedia = async () => {
				const source = document.createElement("canvas");
				source.width = 320;
				source.height = 180;
				source.getContext("2d")!.fillRect(0, 0, source.width, source.height);
				return source.captureStream(10);
			};
		});
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await expect(page.getByRole("alert").filter({ hasText: text })).toHaveCount(
			0,
		);
	});
}

test("camera interruption cancels countdown and reconnect restores capture", async ({
	page,
}) => {
	let uploads = 0;
	await page.route("**/api/photos", (route) => {
		uploads++;
		return route.fulfill({ json: { saved: true } });
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Take a photo" }).click();
	await page.locator("video").evaluate((video: HTMLVideoElement) => {
		const stream = video.srcObject;
		if (!(stream instanceof MediaStream))
			throw new Error("Camera stream is missing.");
		stream.getVideoTracks()[0].dispatchEvent(new Event("mute"));
	});
	await expect(
		page.getByRole("alert").filter({ hasText: "Camera paused" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await expect(
		page.getByRole("button", { name: "Connect", exact: true }),
	).toBeEnabled();
	await page.waitForTimeout(3200);
	expect(uploads).toBe(0);
	expect(
		await page.evaluate(
			() =>
				(
					window as Window & { boothAudioEvents?: { kind: string }[] }
				).boothAudioEvents?.filter((event) => event.kind === "shutter").length,
		),
	).toBe(0);
	await expect(page.getByAltText("A moment at the baby shower")).toHaveCount(0);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
});

test("frame and camera appear in preview and are automatically uploaded without a download step", async ({
	page,
}) => {
	let uploaded: Buffer | null = null;
	await page.route("**/api/photos", async (route) => {
		uploaded = route.request().postDataBuffer();
		await route.fulfill({ json: { saved: true } });
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
	const capture = page.getByRole("button", { name: "Take a photo" });
	await expect(capture).toBeEnabled();
	await expect
		.poll(() =>
			page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
				const canvas = document.createElement("canvas");
				canvas.width = source.width;
				canvas.height = source.height;
				const ctx = canvas.getContext("2d")!;
				ctx.drawImage(source, 0, 0);
				const cameraLeft = ctx.getImageData(
					Math.round(source.width * 0.35),
					Math.round(source.height * 0.5),
					1,
					1,
				).data;
				const cameraRight = ctx.getImageData(
					Math.round(source.width * 0.65),
					Math.round(source.height * 0.5),
					1,
					1,
				).data;
				const border = ctx.getImageData(5, 5, 1, 1).data;
				const openingBehindText = ctx.getImageData(
					Math.round((source.width * 710) / 1153),
					Math.round((source.height * 145) / 768),
					1,
					1,
				).data;
				return (
					cameraLeft[1] > 200 &&
					cameraLeft[0] < 30 &&
					cameraRight[0] > 200 &&
					cameraRight[1] < 30 &&
					openingBehindText[0] > 200 &&
					openingBehindText[1] < 30 &&
					!(border[1] > 200 && border[0] < 30)
				);
			}),
		)
		.toBe(true);
	await capture.click();
	await expect(page.getByAltText("A moment at the baby shower")).toBeVisible({
		timeout: 10_000,
	});
	await expect(page.getByText("Saved privately for the host.")).toBeVisible();
	const sounds = await page.evaluate(
		() =>
			(
				window as Window & {
					boothAudioEvents?: {
						kind: string;
						time: number;
						frequency?: number;
						duration?: number;
						hasSignal?: boolean;
					}[];
				}
			).boothAudioEvents,
	);
	expect(sounds?.map((sound) => sound.kind)).toEqual([
		"countdown",
		"countdown",
		"countdown",
		"shutter",
	]);
	expect(sounds?.slice(0, 3).every((sound) => sound.frequency === 880)).toBe(
		true,
	);
	expect(sounds?.[3]).toMatchObject({
		duration: expect.closeTo(0.18, 2),
		hasSignal: true,
	});
	for (let index = 1; index < 4; index++) {
		expect(sounds![index].time - sounds![index - 1].time).toBeGreaterThan(700);
	}
	const matches = await page
		.getByAltText("A moment at the baby shower")
		.evaluate((image: HTMLImageElement) => {
			const canvas = document.createElement("canvas");
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const context = canvas.getContext("2d")!;
			context.drawImage(image, 0, 0);
			const left = context.getImageData(
				Math.round(canvas.width * 0.35),
				Math.round(canvas.height * 0.5),
				1,
				1,
			).data;
			const right = context.getImageData(
				Math.round(canvas.width * 0.65),
				Math.round(canvas.height * 0.5),
				1,
				1,
			).data;
			const border = context.getImageData(5, 5, 1, 1).data;
			const openingBehindText = context.getImageData(
				Math.round((canvas.width * 710) / 1153),
				Math.round((canvas.height * 145) / 768),
				1,
				1,
			).data;
			return (
				left[1] > 180 &&
				left[0] < 50 &&
				right[0] > 180 &&
				right[1] < 50 &&
				openingBehindText[0] > 180 &&
				openingBehindText[1] < 50 &&
				!(border[1] > 180 && border[0] < 50)
			);
		});
	expect(matches).toBe(true);
	const capturedBytes = await page
		.getByAltText("A moment at the baby shower")
		.evaluate(async (image: HTMLImageElement) => {
			const response = await fetch(image.src);
			return Array.from(new Uint8Array(await response.arrayBuffer()));
		});
	expect(Buffer.from(capturedBytes)).toEqual(uploaded);
	await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "Retake" }).click();
	await expect(capture).toBeVisible();
});

for (const failure of ["unconfigured", "offline"]) {
	test(`download is a fallback when photo saving is ${failure}, and retry can recover`, async ({
		page,
	}) => {
		let attempts = 0;
		let uploaded: Buffer | null = null;
		await page.route("**/api/photos", async (route) => {
			uploaded = route.request().postDataBuffer();
			attempts++;
			if (attempts === 1) {
				if (failure === "offline") {
					await route.abort("internetdisconnected");
					return;
				}
				await route.fulfill({
					status: 503,
					json: { error: "Online photo saving is not configured." },
				});
				return;
			}
			await route.fulfill({ json: { saved: true } });
		});
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await page.getByRole("button", { name: "Take a photo" }).click();
		await expect(
			page.getByRole("alert").filter({ hasText: "Not saved online:" }),
		).toBeVisible({ timeout: 10_000 });
		const downloadPromise = page.waitForEvent("download");
		await page.getByRole("link", { name: "Download photo" }).click();
		const download = await downloadPromise;
		expect(await readFile(await download.path())).toEqual(uploaded);
		await page.getByRole("button", { name: "Retry saving" }).click();
		await expect(page.getByText("Saved privately for the host.")).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Download photo" }),
		).toHaveCount(0);
		expect(attempts).toBe(2);
	});
}

test("oversized captures offer download without sending a request to Vercel", async ({
	page,
}) => {
	let attempts = 0;
	await page.route("**/api/photos", (route) => {
		attempts++;
		return route.fulfill({ json: { saved: true } });
	});
	await page.addInitScript(() => {
		HTMLCanvasElement.prototype.toBlob = function (callback) {
			callback(
				new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" }),
			);
		};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Take a photo" }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "4 MB upload limit" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(
		page.getByRole("link", { name: "Download photo" }),
	).toBeVisible();
	expect(attempts).toBe(0);
});

test("saving prevents retake and only confirmed saves hide the fallback", async ({
	page,
}) => {
	let release: (() => void) | undefined;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/photos", async (route) => {
		await pending;
		await route.fulfill({ json: {} });
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Take a photo" }).click();
	await expect(page.getByText("Saving photo…")).toBeVisible({
		timeout: 10_000,
	});
	await expect(page.getByRole("button", { name: "Retake" })).toBeDisabled();
	await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(
		0,
	);
	release?.();
	await expect(
		page.getByRole("alert").filter({ hasText: "did not confirm" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Download photo" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Retake" })).toBeEnabled();
});

test("saving optimistically reserves one upload and rolls back when the save fails", async ({
	page,
}) => {
	let release: (() => void) | undefined;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/photos", async (route) => {
		await pending;
		await route.fulfill({
			status: 503,
			json: { error: "Could not save photo. Please retry." },
		});
	});
	await page.goto("/");
	await expect(
		page.getByText("20 of 20 photo uploads remaining"),
	).toBeVisible();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Take a photo" }).click();
	await expect(page.getByText("Saving photo…")).toBeVisible({
		timeout: 10_000,
	});
	await expect(
		page.getByText("19 of 20 photo uploads remaining"),
	).toBeVisible();
	release?.();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not save photo" }),
	).toBeVisible();
	await expect(
		page.getByText("20 of 20 photo uploads remaining"),
	).toBeVisible();
});

test("the camera shows through the frame window and green keying stays optional", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const source = document.createElement("canvas");
		source.width = 320;
		source.height = 180;
		const context = source.getContext("2d")!;
		navigator.mediaDevices.getUserMedia = async () => {
			const stream = source.captureStream(10);
			const paint = () => {
				context.fillStyle = "#00ff00";
				context.fillRect(0, 0, 320, 180);
				requestAnimationFrame(paint);
			};
			paint();
			return stream;
		};
	});
	await page.goto("/");
	await expect(
		page.getByRole("region", { name: "Choose a frame" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const sample = () =>
		page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
			const canvas = document.createElement("canvas");
			canvas.width = source.width;
			canvas.height = source.height;
			const context = canvas.getContext("2d")!;
			context.drawImage(source, 0, 0);
			return Array.from(
				context.getImageData(
					Math.round(source.width * 0.35),
					Math.round(source.height * 0.5),
					1,
					1,
				).data,
			);
		});
	// Without green keying the camera is visible through the frame's transparent window.
	await expect
		.poll(async () => {
			const [red, green] = await sample();
			return red < 60 && green > 200;
		})
		.toBe(true);
	await page.evaluate(() => {
		localStorage.setItem(
			"photo-booth-preferences",
			JSON.stringify({
				state: { settings: { greenScreen: true } },
				version: 0,
			}),
		);
	});
	await page.reload();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect
		.poll(async () => {
			const [red, , blue] = await sample();
			return red > 180 && blue > 200;
		})
		.toBe(true);
});

test("booth explains when the key color is not visible to the camera", async ({
	page,
}) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			"photo-booth-preferences",
			JSON.stringify({
				state: { settings: { greenScreen: true } },
				version: 0,
			}),
		);
		const source = document.createElement("canvas");
		source.width = 320;
		source.height = 180;
		const context = source.getContext("2d")!;
		Object.assign(window, { cameraColor: "#c8b49a" });
		navigator.mediaDevices.getUserMedia = async () => {
			const stream = source.captureStream(10);
			const paint = () => {
				context.fillStyle = (
					window as unknown as { cameraColor: string }
				).cameraColor;
				context.fillRect(0, 0, 320, 180);
				requestAnimationFrame(paint);
			};
			paint();
			return stream;
		};
	});
	await page.goto("/");
	const hint = page.getByText("can't see the green key color", {
		exact: false,
	});
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect(hint).toBeVisible({ timeout: 10_000 });
	await page.evaluate(() => {
		(window as unknown as { cameraColor: string }).cameraColor = "#00a000";
	});
	await expect(hint).toHaveCount(0, { timeout: 10_000 });
	await page.evaluate(() => {
		(window as unknown as { cameraColor: string }).cameraColor = "#c8b49a";
	});
	await expect(hint).toBeVisible({ timeout: 10_000 });
});

test("admin uploads backdrops and guests select the carousel below the video", async ({
	page,
	context,
	backend,
}) => {
	await context.addCookies([sessionCookie(adminId)]);
	await page.goto("/");
	await expect(
		page.getByText("Admin account · Unlimited photo uploads"),
	).toBeVisible();
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await page.getByRole("link", { name: "Manage backdrops" }).click();
	await expect(
		page.getByRole("heading", { name: "Manage backdrops" }),
	).toBeVisible();
	await expect(
		page.getByText("No uploaded backdrops yet.", { exact: false }),
	).toBeVisible();
	await page.getByLabel("Backdrop name").fill("Clouds");
	await page
		.getByLabel("Image (JPEG")
		.setInputFiles("public/images/photoboot-bg.jpeg");
	await page
		.getByRole("button", { name: "Upload backdrop", exact: true })
		.click();
	await expect(
		page.getByText("Backdrop uploaded.", { exact: true }),
	).toBeVisible();
	await expect(page.getByAltText("clouds", { exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Back to booth" }).click();
	const merged = page.getByRole("region", { name: "Choose a frame" });
	await expect(merged).toBeVisible();
	await expect(
		merged.getByRole("button", { name: "baby shower", exact: true }),
	).toBeVisible();
	await expect(
		merged.getByRole("button", { name: "clouds", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await page.getByRole("link", { name: "Manage backdrops" }).click();
	await page.getByLabel("Backdrop name").fill("Garden");
	const blue = await page.evaluate(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 320;
		canvas.height = 180;
		const context = canvas.getContext("2d")!;
		context.fillStyle = "blue";
		context.fillRect(0, 0, 320, 180);
		return canvas.toDataURL("image/png").split(",")[1];
	});
	await page.getByLabel("Image (JPEG").setInputFiles({
		name: "garden.png",
		mimeType: "image/png",
		buffer: Buffer.from(blue, "base64"),
	});
	await page
		.getByRole("button", { name: "Upload backdrop", exact: true })
		.click();
	await expect(page.getByAltText("garden", { exact: true })).toBeVisible();
	await context.addCookies([sessionCookie()]);
	await page.goto("/");
	const carousel = page.getByRole("region", { name: "Choose a frame" });
	await expect(carousel).toBeVisible();
	await expect(
		page.getByRole("button", { name: "baby shower", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "garden", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "garden", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect
		.poll(() =>
			page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
				const canvas = document.createElement("canvas");
				canvas.width = source.width;
				canvas.height = source.height;
				const context = canvas.getContext("2d")!;
				context.drawImage(source, 0, 0);
				const pixel = context.getImageData(80, 90, 1, 1).data;
				return pixel[2] > 200 && pixel[1] < 30;
			}),
		)
		.toBe(true);
	const preview = await page.locator(".preview").boundingBox();
	const picker = await carousel.boundingBox();
	expect(picker!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(carousel).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	backend.listError = true;
	await page.reload();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load backdrops" }),
	).toBeVisible();
	backend.listError = false;
	await page.getByRole("button", { name: "Retry backdrops" }).click();
	await expect(carousel).toBeVisible();
});

test("jpeg backdrops with a checkerboard window upload as a png with real transparency", async ({
	page,
	context,
	backend,
}) => {
	await context.addCookies([sessionCookie(adminId)]);
	await page.goto("/admin/backdrops");
	const images = await page.evaluate(() => {
		const render = (checkerboard: boolean) => {
			const canvas = document.createElement("canvas");
			canvas.width = 640;
			canvas.height = 360;
			const context = canvas.getContext("2d")!;
			context.fillStyle = "#f7ecd9";
			context.fillRect(0, 0, 640, 360);
			context.fillStyle = "#8888c8";
			context.fillRect(152, 84, 336, 192);
			if (checkerboard) {
				context.fillStyle = "#ffffff";
				context.fillRect(160, 92, 320, 176);
				context.fillStyle = "#cccccc";
				for (let row = 0; row < 11; row++)
					for (let column = 0; column < 20; column++)
						if ((row + column) % 2)
							context.fillRect(160 + column * 16, 92 + row * 16, 16, 16);
			}
			return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
		};
		return { checkered: render(true), plain: render(false) };
	});
	await page.getByLabel("Backdrop name").fill("Window");
	await page.getByLabel("Image (JPEG").setInputFiles({
		name: "window.jpeg",
		mimeType: "image/jpeg",
		buffer: Buffer.from(images.checkered, "base64"),
	});
	await page
		.getByRole("button", { name: "Upload backdrop", exact: true })
		.click();
	await expect(
		page.getByText("Backdrop uploaded.", { exact: true }),
	).toBeVisible();
	const stored = [...backend.objects.keys()].find((key) =>
		key.endsWith("_window.png"),
	);
	expect(stored).toBeDefined();
	const png = backend.objects.get(stored!)!;
	expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
	const pixels = await page.evaluate(async (encoded) => {
		const blob = await (await fetch(`data:image/png;base64,${encoded}`)).blob();
		const image = await createImageBitmap(blob);
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext("2d")!;
		context.drawImage(image, 0, 0);
		const alpha = (x: number, y: number) =>
			context.getImageData(x, y, 1, 1).data[3];
		return {
			width: image.width,
			height: image.height,
			window: alpha(320, 180),
			border: alpha(156, 180),
			background: alpha(20, 20),
		};
	}, png.toString("base64"));
	expect(pixels).toEqual({
		width: 640,
		height: 360,
		window: 0,
		border: 255,
		background: 255,
	});
	await page.getByLabel("Backdrop name").fill("Plain");
	await page.getByLabel("Image (JPEG").setInputFiles({
		name: "plain.jpeg",
		mimeType: "image/jpeg",
		buffer: Buffer.from(images.plain, "base64"),
	});
	await page
		.getByRole("button", { name: "Upload backdrop", exact: true })
		.click();
	await expect(page.getByAltText("plain", { exact: true })).toBeVisible();
	const plain = [...backend.objects.keys()].find((key) =>
		key.endsWith("_plain.jpg"),
	);
	expect(plain).toBeDefined();
	expect(
		backend.objects.get(plain!)!.equals(Buffer.from(images.plain, "base64")),
	).toBe(true);
});

test("admin hides backdrops and assigns the booth default guests start from", async ({
	page,
	context,
}) => {
	await context.addCookies([sessionCookie(adminId)]);
	const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
	for (const name of ["Clouds", "Garden"]) {
		expect(
			(
				await page.request.post(`/api/backdrops?name=${name}`, {
					headers: { "Content-Type": "image/jpeg" },
					data: jpeg,
				})
			).status(),
		).toBe(200);
	}
	await page.goto("/admin/backdrops");
	const clouds = page.locator("figure").filter({ hasText: "clouds" });
	const garden = page.locator("figure").filter({ hasText: "garden" });
	await garden.getByRole("button", { name: "Make booth default" }).click();
	await expect(garden.getByText("· Booth default")).toBeVisible();
	await clouds.getByRole("button", { name: "Hide from booth" }).click();
	await expect(clouds.getByText("· Hidden")).toBeVisible();
	await expect(
		clouds.getByRole("button", { name: "Make booth default" }),
	).toBeDisabled();
	await context.addCookies([sessionCookie()]);
	await page.goto("/");
	await expect(
		page.getByRole("button", { name: "garden", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "clouds", exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "baby shower", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "baby shower", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "baby shower", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "garden", exact: true }),
	).toHaveAttribute("aria-pressed", "false");
	await context.addCookies([sessionCookie(adminId)]);
	await page.goto("/admin/backdrops");
	await garden.getByRole("button", { name: "Use built-in default" }).click();
	await expect(
		garden.getByRole("button", { name: "Make booth default" }),
	).toBeVisible();
	await clouds.getByRole("button", { name: "Show in booth" }).click();
	await expect(
		clouds.getByRole("button", { name: "Hide from booth" }),
	).toBeVisible();
	await context.addCookies([sessionCookie()]);
	await page.goto("/");
	await expect(page.locator(".background-option").first()).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(
		page.getByRole("button", { name: "clouds", exact: true }),
	).toBeVisible();
});

for (const interim of [false, true]) {
	test(`voice capture starts one countdown and can capture again after retake (${interim ? "interim" : "final"} results)`, async ({
		page,
	}) => {
		await page.addInitScript(() => {
			class FakeRecognition {
				continuous = false;
				interimResults = false;
				lang = "";
				onstart: (() => void) | null = null;
				onresult: ((event: object) => void) | null = null;
				onerror: ((event: object) => void) | null = null;
				onend: (() => void) | null = null;
				start() {
					this.onstart?.();
				}
				abort() {
					this.onend?.();
				}
				constructor() {
					Object.assign(window, { fakeRecognition: this });
				}
			}
			Object.assign(window, {
				SpeechRecognition: FakeRecognition,
				webkitSpeechRecognition: FakeRecognition,
			});
		});
		await page.route("**/api/photos", (route) =>
			route.fulfill({ json: { saved: true } }),
		);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await page.getByRole("button", { name: "Enable voice capture" }).click();
		await expect(
			page.getByRole("status").filter({ hasText: "Listening for" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Stop voice capture" }),
		).toHaveAttribute("aria-pressed", "true");
		await expect(
			page.getByRole("button", { name: "Stop voice capture" }),
		).toHaveCSS("border-top-style", "solid");
		await expect(
			page.getByRole("button", { name: "Stop voice capture" }),
		).toHaveCSS("color", "rgb(56, 121, 92)");
		let resultIndex = 0;
		const speak = async (text: string, isFinal = true) => {
			await page.evaluate(
				({ transcript, isFinal, resultIndex }) => {
					const recognition = (
						window as Window & {
							fakeRecognition?: { onresult: (event: object) => void };
						}
					).fakeRecognition;
					if (!recognition) throw new Error("Fake recognition not initialized");
					recognition.onresult({
						resultIndex,
						results: Array.from({ length: resultIndex + 1 }, () => ({
							isFinal,
							0: { transcript },
						})),
					});
				},
				{ transcript: text, isFinal, resultIndex },
			);
			if (isFinal) resultIndex++;
		};
		expect(
			await page.evaluate(
				() =>
					(window as Window & { fakeRecognition?: { interimResults: boolean } })
						.fakeRecognition?.interimResults,
			),
		).toBe(true);
		await speak("recaptured");
		await expect(
			page.getByRole("status").filter({ hasText: "Heard: “recaptured”" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await speak("Capture!", !interim);
		await speak("capture", !interim);
		await expect(
			page.getByRole("button", { name: "Get ready" }),
		).toBeDisabled();
		await expect(page.getByAltText("A moment at the baby shower")).toBeVisible({
			timeout: 10_000,
		});
		await speak("capture", !interim);
		await expect(
			page.getByAltText("A moment at the baby shower"),
		).toBeVisible();
		await page.getByRole("button", { name: "Retake" }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		if (interim) {
			await speak("capture");
			await expect(
				page.getByRole("button", { name: "Take a photo" }),
			).toBeEnabled();
		}
		await speak("capture");
		await expect(page.getByAltText("A moment at the baby shower")).toBeVisible({
			timeout: 10_000,
		});
		await page.getByRole("button", { name: "Stop voice capture" }).click();
		await expect(page.getByText("Voice control is off.")).toBeVisible();
		const audio = await page.evaluate(
			() =>
				(window as Window & { boothAudioEvents?: { kind: string }[] })
					.boothAudioEvents,
		);
		expect(audio?.filter((event) => event.kind === "countdown")).toHaveLength(
			6,
		);
		expect(audio?.filter((event) => event.kind === "shutter")).toHaveLength(2);
	});
}

test("audio failure is explicit but does not prevent capture and saving", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "AudioContext", {
			value: class {
				constructor() {
					throw new Error("Audio unavailable");
				}
			},
		});
	});
	await page.route("**/api/photos", (route) =>
		route.fulfill({ json: { saved: true } }),
	);
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "Sound is unavailable" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Take a photo" }).click();
	await expect(page.getByText("Saved privately for the host.")).toBeVisible({
		timeout: 10_000,
	});
});

test("voice control reports microphone errors and remains optional", async ({
	page,
}) => {
	await page.addInitScript(() => {
		class DeniedRecognition {
			onerror: ((event: object) => void) | null = null;
			start() {
				this.onerror?.({ error: "not-allowed" });
			}
			abort() {}
		}
		Object.assign(window, {
			SpeechRecognition: DeniedRecognition,
			webkitSpeechRecognition: DeniedRecognition,
		});
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Enable voice capture" }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "permission was denied" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Enable voice capture" }),
	).toBeVisible();
});

test("voice control retries a network failure and reports a useful error", async ({
	page,
}) => {
	await page.addInitScript(() => {
		class NetworkRecognition {
			onerror: ((event: object) => void) | null = null;
			onend: (() => void) | null = null;
			starts = 0;
			start() {
				this.starts++;
				queueMicrotask(() => {
					this.onerror?.({ error: "network" });
					this.onend?.();
				});
			}
			abort() {
				this.onend?.();
			}
			constructor() {
				Object.assign(window, { fakeRecognition: this });
			}
		}
		Object.assign(window, {
			SpeechRecognition: NetworkRecognition,
			webkitSpeechRecognition: NetworkRecognition,
		});
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Enable voice capture" }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Retrying" }),
	).toBeVisible();
	await expect(
		page.getByRole("alert").filter({ hasText: "speech service" }),
	).toBeVisible({ timeout: 10_000 });
	expect(
		await page.evaluate(
			() =>
				(window as Window & { fakeRecognition?: { starts: number } })
					.fakeRecognition?.starts,
		),
	).toBe(3);
	await expect(
		page.getByRole("button", { name: "Enable voice capture" }),
	).toBeVisible();
});

test("voice control restarts after recognition ends and stops when requested", async ({
	page,
}) => {
	await page.addInitScript(() => {
		class FakeRecognition {
			onstart: (() => void) | null = null;
			onend: (() => void) | null = null;
			starts = 0;
			start() {
				this.starts++;
				this.onstart?.();
			}
			abort() {
				this.onend?.();
			}
			constructor() {
				Object.assign(window, { fakeRecognition: this });
			}
		}
		Object.assign(window, {
			SpeechRecognition: FakeRecognition,
			webkitSpeechRecognition: FakeRecognition,
		});
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Enable voice capture" }).click();
	await page.evaluate(() => {
		const recognition = (
			window as Window & { fakeRecognition?: { onend: () => void } }
		).fakeRecognition;
		if (!recognition) throw new Error("Fake recognition not initialized");
		recognition.onend();
	});
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as Window & { fakeRecognition?: { starts: number } })
						.fakeRecognition?.starts,
			),
		)
		.toBe(2);
	await page.getByRole("button", { name: "Stop voice capture" }).click();
	await page.waitForTimeout(700);
	expect(
		await page.evaluate(
			() =>
				(window as Window & { fakeRecognition?: { starts: number } })
					.fakeRecognition?.starts,
		),
	).toBe(2);
});

test("unsupported voice recognition leaves the manual camera control available", async ({
	page,
}) => {
	await page.addInitScript(() =>
		Object.assign(window, {
			SpeechRecognition: undefined,
			webkitSpeechRecognition: undefined,
		}),
	);
	await page.goto("/");
	await page.getByRole("button", { name: "Enable voice capture" }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "not supported" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
});

test("photo endpoint rejects wrong media type and invalid JPEG", async ({
	request,
}) => {
	const invalidType = await request.post("/api/photos", {
		headers: { "content-type": "text/plain" },
		data: "x",
	});
	expect(invalidType.status()).toBe(415);
	const invalidImage = await request.post("/api/photos", {
		headers: { "content-type": "image/jpeg" },
		data: "x",
	});
	expect(invalidImage.status()).toBe(400);
});

test("photo endpoint stores the JPEG in the user's private folder without a booth code", async ({
	request,
	backend,
}) => {
	const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
	const result = await request.post("/api/photos", {
		headers: { "content-type": "image/jpeg" },
		data: image,
	});
	expect(result.status()).toBe(200);
	expect(await result.json()).toMatchObject({
		saved: true,
		quota: { used: 1, remaining: 19 },
	});
	expect([...backend.objects.keys()][0]).toMatch(
		/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.jpg$/,
	);
	expect([...backend.objects.values()][0]).toEqual(image);
});

test("authenticated gallery browses pages and refreshes with the booth theme", async ({
	page,
}) => {
	const image =
		"data:image/svg+xml," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1153" height="768"><rect width="1153" height="768" fill="skyblue"/></svg>',
		);
	let requests = 0;
	await page.route("**/api/photos?offset=*", async (route) => {
		requests++;
		expect(route.request().headers()["x-booth-code"]).toBeUndefined();
		const offset = new URL(route.request().url()).searchParams.get("offset");
		await route.fulfill({
			json: {
				photos: [
					{
						name: offset === "0" ? "newest.jpg" : "older.jpg",
						createdAt: "2026-11-09T12:00:00Z",
						url: image,
					},
				],
				nextOffset: offset === "0" ? 24 : null,
			},
		});
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Menu", exact: true }).click();
	await expect(page.getByRole("link", { name: "View gallery" })).toHaveCSS(
		"color",
		"rgb(85, 142, 174)",
	);
	await page.getByRole("link", { name: "View gallery" }).click();
	await page.mouse.move(0, 0);
	await expect(
		page.getByRole("heading", { name: "Photo gallery" }),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Photo gallery" })).toHaveCSS(
		"color",
		"rgb(52, 93, 118)",
	);
	await expect(page.getByRole("link", { name: "Back to booth" })).toHaveCSS(
		"color",
		"rgb(85, 142, 174)",
	);
	await expect(
		page.getByAltText("Baby-shower memory newest.jpg"),
	).toBeVisible();
	await expect
		.poll(() =>
			page
				.getByAltText("Baby-shower memory newest.jpg")
				.evaluate((image: HTMLImageElement) => image.naturalWidth),
		)
		.toBe(1153);
	await expect(
		page.getByRole("link", { name: "Open photo newest.jpg" }),
	).toHaveAttribute("target", "_blank");
	await page.getByRole("button", { name: "Load more photos" }).click();
	await expect(page.getByAltText("Baby-shower memory older.jpg")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Load more photos" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(page.getByAltText("Baby-shower memory older.jpg")).toHaveCount(
		0,
	);
	await expect(
		page.getByRole("button", { name: "Sign out", exact: true }),
	).toBeVisible();
	expect(
		await page.evaluate(() =>
			JSON.stringify({ ...localStorage, ...sessionStorage }),
		),
	).not.toContain("access_token");
	await page.reload();
	await expect(
		page.getByAltText("Baby-shower memory newest.jpg"),
	).toBeVisible();
	expect(requests).toBeGreaterThanOrEqual(4);
});

test("gallery shows connection, empty-state and expired-image errors", async ({
	page,
}) => {
	let mode: "unavailable" | "offline" | "empty" | "expired" = "unavailable";
	await page.route("**/api/photos?offset=*", async (route) => {
		if (mode === "unavailable") {
			await route.fulfill({
				status: 503,
				json: { error: "Could not load photos. Please retry." },
			});
		} else if (mode === "offline") {
			await route.abort("internetdisconnected");
		} else if (mode === "empty") {
			await route.fulfill({ json: { photos: [], nextOffset: null } });
		} else {
			await route.fulfill({
				json: {
					photos: [
						{
							name: "expired.jpg",
							createdAt: "2026-11-09T12:00:00Z",
							url: "/expired-image.jpg",
						},
					],
					nextOffset: null,
				},
			});
		}
	});
	await page.route("**/expired-image.jpg", (route) =>
		route.fulfill({ status: 403, body: "" }),
	);
	await page.goto("/gallery");
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load photos" }),
	).toBeVisible();
	mode = "offline";
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: /fetch/i }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Refresh photos" }),
	).toBeEnabled();
	mode = "empty";
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(
		page.getByText("No photos yet.", { exact: false }),
	).toBeVisible();
	mode = "expired";
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "link expired" }),
	).toBeVisible();
});

test("gallery keeps loaded photos visible when a background refresh fails", async ({
	page,
}) => {
	let failing = false;
	await page.route("**/api/photos?offset=*", async (route) => {
		if (failing)
			return route.fulfill({
				status: 503,
				json: { error: "Could not load photos. Please retry." },
			});
		await route.fulfill({
			json: {
				photos: [
					{
						name: "kept.jpg",
						createdAt: "2026-11-09T12:00:00Z",
						url: "/kept.jpg",
					},
				],
				nextOffset: null,
			},
		});
	});
	await page.goto("/gallery");
	await expect(page.getByText("1 photo loaded")).toBeVisible();
	await expect(page.getByText(/^Updated /)).toBeVisible();
	failing = true;
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(
		page
			.getByRole("alert")
			.filter({ hasText: "Showing previously loaded photos" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Open photo kept.jpg" }),
	).toBeVisible();
	await expect(page.getByText("No photos yet.", { exact: false })).toHaveCount(
		0,
	);
});

test("gallery endpoint paginates private storage and reports storage failures", async ({
	request,
	backend,
}) => {
	for (const offset of ["-1", "abc", "1.5", "9007199254740991"]) {
		expect((await request.get(`/api/photos?offset=${offset}`)).status()).toBe(
			400,
		);
	}
	await backend.db.exec(
		"insert into storage.objects(bucket_id, name) select 'photos', '11111111-1111-4111-8111-111111111111/' || i || '.jpg' from generate_series(1, 25) i;",
	);
	const first = await request.get("/api/photos");
	expect(first.status()).toBe(200);
	expect(first.headers()["cache-control"]).toBe("private, no-store");
	const result = await first.json();
	expect(result.photos).toHaveLength(24);
	expect(result.nextOffset).toBe(24);
	expect(result.photos[0].url).toContain("?token=test-token");
	const last = await request.get("/api/photos?offset=24");
	expect(await last.json()).toMatchObject({
		nextOffset: null,
		photos: [expect.objectContaining({ name: expect.any(String) })],
	});
	await backend.db.exec("delete from storage.objects;");
	expect(await (await request.get("/api/photos")).json()).toEqual({
		photos: [],
		nextOffset: null,
	});
	await backend.db.exec(
		"insert into storage.objects(bucket_id, name) values ('photos', '11111111-1111-4111-8111-111111111111/one.jpg');",
	);
	for (const mode of ["listError", "signError"] as const) {
		backend.listError = false;
		backend.signError = false;
		backend[mode] = true;
		const failed = await request.get("/api/photos");
		expect(failed.status()).toBe(503);
		expect(await failed.json()).toHaveProperty("error");
	}
});
