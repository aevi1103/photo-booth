import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { adminId, expect, sessionCookie, test } from "./fixtures";

async function mockSavedCapture(page: Page) {
	let uploaded: Buffer | null = null;
	await page.route("**/api/photos?offset=*", (route) =>
		route.fulfill({
			json: {
				photos: uploaded
					? [
							{
								name: "captured.jpg",
								createdAt: new Date().toISOString(),
								url: `data:image/jpeg;base64,${uploaded.toString("base64")}`,
							},
						]
					: [],
				nextOffset: null,
			},
		}),
	);
	await page.route("**/api/photos", (route) => {
		uploaded = route.request().postDataBuffer();
		return route.fulfill({ json: { saved: true } });
	});
	return () => uploaded;
}

// Every frame box is shot before review; the default frame has three boxes.
async function savePhoto(page: Page) {
	const save = page.getByRole("button", { name: "Save photo" });
	await expect(save).toBeVisible({ timeout: 30_000 });
	await save.click();
}

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
	mirror = true,
	captured = false,
) {
	return page.evaluate(
		async ({ opening, mirror, captured }) => {
			const source = document.querySelector<HTMLCanvasElement>(
				'[aria-label="Live photo booth preview"]',
			);
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
			frame.src = "/frames/baby-shower.png";
			await frame.decode();
			context.drawImage(frame, 0, 0);
			const actual = document.createElement("canvas");
			actual.width = source.width;
			actual.height = source.height;
			const actualContext = actual.getContext("2d")!;
			const photo =
				document.querySelector<HTMLImageElement>(".gallery-photo img");
			if (captured && (!photo || !photo.complete)) return false;
			if (captured) {
				// The saved print contains the whole frame, centered.
				const scale = Math.min(
					photo!.naturalWidth / source.width,
					photo!.naturalHeight / source.height,
				);
				const width = source.width * scale;
				const height = source.height * scale;
				actualContext.drawImage(
					photo!,
					(photo!.naturalWidth - width) / 2,
					(photo!.naturalHeight - height) / 2,
					width,
					height,
					0,
					0,
					source.width,
					source.height,
				);
			} else actualContext.drawImage(source, 0, 0);
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
	await page.addInitScript(() => {
		const draw = WebGL2RenderingContext.prototype.drawArrays;
		WebGL2RenderingContext.prototype.drawArrays = function (...args) {
			const result = draw.apply(this, args);
			if (
				this.canvas instanceof HTMLCanvasElement &&
				this.canvas.closest(".booth-snow") &&
				this.getParameter(this.FRAMEBUFFER_BINDING) === null
			) {
				const frames = Number(this.canvas.dataset.frames ?? 0) + 1;
				this.canvas.dataset.frames = String(frames);
				if (frames >= 20 && !this.canvas.dataset.visibleSnow) {
					const pixels = new Uint8Array(
						this.canvas.width * this.canvas.height * 4,
					);
					this.readPixels(
						0,
						0,
						this.canvas.width,
						this.canvas.height,
						this.RGBA,
						this.UNSIGNED_BYTE,
						pixels,
					);
					if (pixels.some((value, index) => index % 4 === 3 && value > 0)) {
						this.canvas.dataset.visibleSnow = "true";
					}
				}
			}
			return result;
		};
	});
	await page.goto("/");
	const background = page.locator(".booth-snow");
	await expect(background).toBeVisible();
	await expect(background).toHaveCSS("pointer-events", "none");
	await expect
		.poll(async () =>
			Number(await background.locator("canvas").getAttribute("data-frames")),
		)
		.toBeGreaterThan(3);
	await expect(background.locator("canvas")).toHaveAttribute(
		"data-visible-snow",
		"true",
	);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect(background).toBeHidden();
	await page.reload();
	await expect(background).toBeHidden();
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await expect(background).toBeVisible();
	await expect
		.poll(async () =>
			Number(await background.locator("canvas").getAttribute("data-frames")),
		)
		.toBeGreaterThan(3);
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 },
]) {
	test(`mobile camera switching, framed capture, and upload at ${viewport.width}px`, async ({
		page,
	}) => {
		test.slow();
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
		await mockSavedCapture(page);
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
		expect(captureButton!.width).toBeGreaterThan(voiceButton!.width * 2);
		expect(captureButton!.height).toBeGreaterThanOrEqual(56);
		expect(voiceButton!.width).toBeGreaterThanOrEqual(44);
		expect(voiceButton!.height).toBeGreaterThanOrEqual(44);
		await expect(
			page.getByRole("button", { name: "Enable voice capture" }),
		).toHaveText("");
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
					.getByLabel("Live photo booth preview")
					.evaluate((canvas: HTMLCanvasElement) => canvas.width),
			)
			.toBe(1920);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		await page.getByRole("button", { name: "Take a photo" }).click();
		await expect(
			page.getByRole("combobox", { name: "Camera device" }),
		).toBeDisabled();
		await savePhoto(page);
		await expect(
			page.getByAltText("Baby-shower memory captured.jpg"),
		).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText("Saved privately for the host.")).toBeVisible();
		const dimensions = await page
			.getByAltText("Baby-shower memory captured.jpg")
			.evaluate((image: HTMLImageElement) => ({
				width: image.naturalWidth,
				height: image.naturalHeight,
			}));
		// Saved as a 6x4 in print at 300 DPI.
		expect(dimensions).toEqual({ width: 1800, height: 1200 });
		const jfif = await page
			.getByAltText("Baby-shower memory captured.jpg")
			.evaluate(async (image: HTMLImageElement) =>
				Array.from(
					new Uint8Array(await (await fetch(image.src)).arrayBuffer()).slice(
						13,
						18,
					),
				),
			);
		expect(jfif).toEqual([1, 1, 44, 1, 44]);
	});
}

for (const [width, height] of [
	[320, 480],
	[480, 320],
	[400, 400],
]) {
	test(`frame geometry ${width}x${height} saves a whole-frame 6x4 print and crops to the transparent opening`, async ({
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
		await mockSavedCapture(page);
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
					.getByLabel("Live photo booth preview")
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
		await savePhoto(page);
		const photo = page.getByAltText("Baby-shower memory captured.jpg");
		await expect(photo).toBeVisible({ timeout: 10_000 });
		expect(
			await photo.evaluate((image: HTMLImageElement) => [
				image.naturalWidth,
				image.naturalHeight,
			]),
		).toEqual(height > width ? [1200, 1800] : [1800, 1200]);
		expect(await compositionMatches(page, opening, true, true)).toBe(true);
	});
}

test("portrait photo mode contains the entire default frame on mobile", async ({
	page,
}) => {
	await mockFrame(page, 320, 480);
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const original = await page
		.locator("video")
		.evaluateHandle((video: HTMLVideoElement) => video.srcObject);
	await expect
		.poll(() =>
			page
				.getByLabel("Live photo booth preview")
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
				.getByLabel("Live photo booth preview")
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
				.getByLabel("Live photo booth preview")
				.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
		).toEqual([320, 480]);
	});
}

test("frames over the pixel budget fail before transparency analysis", async ({
	page,
}) => {
	await mockFrame(page, 64, 64, "opaque");
	await page.addInitScript(() => {
		const width = Object.getOwnPropertyDescriptor(
			HTMLImageElement.prototype,
			"naturalWidth",
		)?.get;
		const height = Object.getOwnPropertyDescriptor(
			HTMLImageElement.prototype,
			"naturalHeight",
		)?.get;
		Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
			configurable: true,
			get() {
				return this.src.includes("/frames/") ? 4096 : width?.call(this);
			},
		});
		Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
			configurable: true,
			get() {
				return this.src.includes("/frames/") ? 4096 : height?.call(this);
			},
		});
	});
	await page.goto("/");
	await expect(
		page.getByRole("alert").filter({ hasText: "8 megapixels" }),
	).toBeVisible();
});

test("frame load failures block capture and refreshing a repaired frame recovers", async ({
	page,
}) => {
	await page.route("**/frames/baby-shower.png", (route) => route.abort());
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load that frame" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await page.unroute("**/frames/baby-shower.png");
	await page.reload();
	await page.getByRole("button", { name: "Connect", exact: true }).click();
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
	await expect(page.locator(".background-option")).toHaveCount(0);
	await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
});

test("mirror is on by default, even over an old saved choice, and turning it off lasts only for the page", async ({
	page,
}) => {
	await mockFrame(page, 320, 480, "transparent");
	await page.addInitScript(() => {
		if (!localStorage.getItem("photo-booth-preferences")) {
			localStorage.setItem(
				"photo-booth-preferences",
				JSON.stringify({ state: { settings: { mirror: false } }, version: 0 }),
			);
		}
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const cameraColors = () =>
		page
			.getByLabel("Live photo booth preview")
			.evaluate((source: HTMLCanvasElement) => {
				const canvas = document.createElement("canvas");
				canvas.width = source.width;
				canvas.height = source.height;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Could not read the preview.");
				context.drawImage(source, 0, 0);
				const colorAt = (x: number) =>
					Array.from(
						context.getImageData(
							Math.floor(canvas.width * x),
							Math.floor(canvas.height / 2),
							1,
							1,
						).data,
					).slice(0, 3);
				return [colorAt(0.3), colorAt(0.7)];
			});
	const expectMirror = async (mirrored: boolean) => {
		await expect
			.poll(async () => {
				const [left, right] = await cameraColors();
				return mirrored
					? left[0] > 200 && left[1] < 30 && right[1] > 200 && right[0] < 30
					: left[1] > 200 && left[0] < 30 && right[0] > 200 && right[1] < 30;
			})
			.toBe(true);
	};
	const mirror = page.getByRole("button", { name: "Mirror", exact: true });
	await expect(mirror).toHaveAttribute("aria-pressed", "true");
	await expectMirror(true);
	await mirror.click();
	await expect(mirror).toHaveAttribute("aria-pressed", "false");
	await expectMirror(false);
	await page.reload();
	await expect(mirror).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expectMirror(true);
	expect(
		await page.evaluate(() => localStorage.getItem("photo-booth-preferences")),
	).not.toContain("mirror");
});

test("the shared default overrides personal choices and ignores a late bundled frame load", async ({
	page,
}) => {
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
	await page.route("**/api/backdrops", (route) =>
		route.fulfill({
			json: {
				backdrops: [{ name: "Shared", url: "/shared.png", isDefault: true }],
			},
		}),
	);
	await page.route("**/shared.png", async (route) =>
		route.fulfill({
			contentType: "image/png",
			body: await readFile("public\\images\\baby-shower-backup.png"),
		}),
	);
	await page.addInitScript(() =>
		localStorage.setItem(
			"photo-booth-preferences",
			JSON.stringify({
				state: {
					background: "/frames/baby-shower.png",
					backgroundChosen: true,
				},
				version: 0,
			}),
		),
	);
	await page.goto("/");
	await expect.poll(() => requested).toBe(true);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
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
			.getByLabel("Live photo booth preview")
			.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height]),
	).toEqual([1153, 768]);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					JSON.parse(localStorage.getItem("photo-booth-preferences")!).state
						.background,
			),
		)
		.toBe("/shared.png");
	await expect(
		page.getByRole("region", { name: "Choose a frame" }),
	).toHaveCount(0);
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

for (const width of [390, 1280]) {
	test(`top toolbar hides and restores the gallery without interrupting the camera at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
		const gallery = page.getByRole("region", {
			name: "Saved photos",
			exact: true,
		});
		const preview = page.locator(".booth-preview");
		const originalWidth = (await preview.boundingBox())!.width;
		const toolbar = page.locator(".preview-heading");
		const menu = page.getByRole("button", { name: "Menu", exact: true });
		const dialog = page.getByRole("dialog", { name: "Menu", exact: true });
		const hide = toolbar.getByRole("button", {
			name: "Hide gallery",
			exact: true,
		});
		await expect(hide).toHaveAttribute("aria-expanded", "true");
		await hide.click();
		await expect(dialog).toBeHidden();
		await expect(gallery).toBeHidden();
		await expect(
			toolbar.getByRole("button", { name: "Show gallery", exact: true }),
		).toBeFocused();
		if (width > 800) {
			expect((await preview.boundingBox())!.width).toBeGreaterThan(
				originalWidth + 100,
			);
		}
		await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
		const show = toolbar.getByRole("button", {
			name: "Show gallery",
			exact: true,
		});
		await expect(show).toHaveAttribute("aria-expanded", "false");
		await show.click();
		await expect(dialog).toBeHidden();
		await expect(gallery).toBeVisible();
		await expect
			.poll(async () => (await preview.boundingBox())!.width)
			.toBeCloseTo(originalWidth, 1);
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await menu.click();
		await expect(
			dialog.getByRole("button", { name: /Hide gallery|Show gallery/ }),
		).toHaveCount(0);
		await page.keyboard.press("Escape");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
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

test("gallery carousel swipes between photos on mobile and opens an accessible viewer", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route("**/api/photos?offset=*", (route) =>
		route.fulfill({
			json: {
				photos: [1, 2, 3].map((number) => ({
					name: `${number}.jpg`,
					createdAt: "2026-11-09T12:00:00Z",
					url:
						"data:image/svg+xml," +
						encodeURIComponent(
							'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="300" height="500" fill="skyblue"/></svg>',
						),
				})),
				nextOffset: null,
			},
		}),
	);
	await page.goto("/");
	const carousel = page.getByRole("region", {
		name: "Photo gallery",
		exact: true,
	});
	await carousel.scrollIntoViewIfNeeded();
	const second = carousel.getByRole("button", { name: "Open photo 2.jpg" });
	const before = await second.boundingBox();
	const first = await carousel
		.getByRole("button", { name: "Open photo 1.jpg" })
		.boundingBox();
	expect(first!.width).toBeLessThan(230);
	await page.mouse.move(
		first!.x + first!.width - 10,
		first!.y + first!.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(first!.x + 10, first!.y + first!.height / 2, {
		steps: 12,
	});
	await page.mouse.up();
	await expect
		.poll(async () => (await second.boundingBox())!.x)
		.toBeLessThan(before!.x - 100);
	await second.click();
	const dialog = page.getByRole("dialog", { name: "Photo memory" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("img")).toHaveCSS("object-fit", "contain");
	expect((await dialog.boundingBox())!.width).toBeLessThan(390);
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(second).toBeFocused();
	await expect(page.locator(".background-option")).toHaveCount(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
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
	const picker = await page.locator(".booth-gallery").boundingBox();
	const camera = await page
		.getByRole("combobox", { name: "Camera device" })
		.boundingBox();
	const photoMode = await page
		.getByRole("button", { name: "Photo mode" })
		.boundingBox();
	expect(stage?.y).toBeLessThan(100);
	expect(stage?.width).toBeGreaterThanOrEqual(650);
	expect(camera!.y).toBeGreaterThanOrEqual(0);
	expect(photoMode!.y).toBeGreaterThanOrEqual(0);
	expect(picker!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width);
	await expect(page.locator(".gallery-scroll")).toHaveCSS("overflow-y", "auto");
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

test("gallery glass preserves visible background detail instead of washing it out", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/");
	await page.addStyleTag({
		content: `
			.booth-snow {
				background: repeating-linear-gradient(90deg, blue 0 12px, red 12px 24px);
			}
			.booth-snow canvas { visibility: hidden; }
		`,
	});
	const gallery = page.getByRole("region", {
		name: "Saved photos",
		exact: true,
	});
	await expect(gallery).toBeVisible();
	const bounds = await gallery.boundingBox();
	if (!bounds) throw new Error("Gallery is not rendered.");
	const screenshot = await page.screenshot({
		clip: {
			x: Math.floor(bounds.x) + 20,
			y: Math.floor(bounds.y + bounds.height) - 100,
			width: 48,
			height: 40,
		},
	});
	const contrast = await page.evaluate(
		async (dataUrl) => {
			const image = new Image();
			image.src = dataUrl;
			await image.decode();
			const canvas = document.createElement("canvas");
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Could not inspect gallery screenshot.");
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 20, image.width, 1).data;
			const reds = Array.from({ length: image.width }, (_, x) => pixels[x * 4]);
			return Math.max(...reds) - Math.min(...reds);
		},
		`data:image/png;base64,${screenshot.toString("base64")}`,
	);
	expect(contrast).toBeGreaterThan(100);
});

test("desktop gallery has one scrolling column and repeated captures refresh newest first", async ({
	page,
}) => {
	test.slow();
	await page.setViewportSize({ width: 1366, height: 768 });
	let captures = 0;
	const image =
		"data:image/svg+xml," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="skyblue"/></svg>',
		);
	await page.route("**/api/photos?offset=*", (route) =>
		route.fulfill({
			json: {
				photos: [
					...(captures
						? [
								{
									name: `capture-${captures}.jpg`,
									createdAt: new Date().toISOString(),
									url: image,
								},
							]
						: []),
					...Array.from({ length: 24 }, (_, index) => ({
						name: `older-${index}.jpg`,
						createdAt: "2026-11-09T12:00:00Z",
						url: image,
					})),
				],
				nextOffset: null,
			},
		}),
	);
	await page.route("**/api/photos", (route) => {
		captures++;
		return route.fulfill({ json: { saved: true } });
	});
	await page.goto("/");
	const gallery = page.getByRole("region", {
		name: "Saved photos",
		exact: true,
	});
	await expect(gallery.locator(".gallery-photo")).toHaveCount(24);
	const refresh = gallery.getByRole("button", { name: "Refresh photos" });
	await expect(refresh).toHaveText("");
	await expect(refresh.locator("svg")).toBeVisible();
	expect((await gallery.boundingBox())!.width).toBeLessThanOrEqual(300);
	await expect(gallery).toHaveCSS("backdrop-filter", /blur\(/);
	await expect(gallery).toHaveCSS(
		"background-color",
		/(?:\/\s*0\.15|,\s*0\.15)\)/,
	);
	await expect(gallery.locator(".gallery-photo time")).toHaveCount(0);
	const thumbnail = gallery.getByRole("button", {
		name: "Open photo older-0.jpg",
	});
	await thumbnail.hover();
	const tooltip = page.locator('[data-slot="tooltip-content"]');
	await expect(tooltip).toContainText("Uploaded");
	await expect(tooltip.locator("time")).toHaveAttribute(
		"dateTime",
		"2026-11-09T12:00:00Z",
	);
	await gallery.getByRole("button", { name: "Refresh photos" }).hover();
	await expect(tooltip).toBeHidden();
	await gallery.getByRole("button", { name: "Refresh photos" }).focus();
	await page.keyboard.press("Tab");
	await expect(thumbnail).toBeFocused();
	await expect(tooltip).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(tooltip).toBeHidden();
	const cards = gallery.locator(".gallery-photo");
	const first = await cards.nth(0).boundingBox();
	expect(first!.width).toBeGreaterThan(200);
	const second = await cards.nth(1).boundingBox();
	const third = await cards.nth(2).boundingBox();
	expect(second!.y).toBeGreaterThan(first!.y);
	expect(second!.x).toBe(first!.x);
	expect(third!.x).toBe(first!.x);
	expect(third!.y).toBeGreaterThan(second!.y);
	const scroll = gallery.locator(".gallery-scroll");
	await scroll.evaluate(
		(element) => (element.scrollTop = element.scrollHeight),
	);
	expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(
		0,
	);
	expect(await page.evaluate(() => window.scrollY)).toBe(0);
	expect((await gallery.boundingBox())!.height).toBe(744);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	for (const number of [1, 2]) {
		if (number === 2) {
			await page
				.getByRole("button", { name: "Hide gallery", exact: true })
				.click();
			await expect(gallery).toBeHidden();
		}
		await page.getByRole("button", { name: "Take a photo" }).click();
		await savePhoto(page);
		if (number === 2) {
			await expect(
				page.getByText("Saved privately for the host.", { exact: true }),
			).toBeVisible({ timeout: 10_000 });
			await page
				.getByRole("button", { name: "Show gallery", exact: true })
				.click();
		}
		await expect(
			gallery.getByRole("button", { name: `Open photo capture-${number}.jpg` }),
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await expect(
			cards
				.first()
				.getByRole("button", { name: `Open photo capture-${number}.jpg` }),
		).toBeVisible();
		expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
	}
	await expect(page.getByRole("button", { name: "Retake" })).toHaveCount(0);
	expect(captures).toBe(2);
});

for (const viewport of [
	{ width: 1920, height: 1080 },
	{ width: 1366, height: 768 },
	{ width: 1024, height: 600 },
]) {
	test(`desktop booth fits viewport at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		test.slow();
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		for (const selector of [
			".booth-preview",
			".preview",
			".booth-gallery",
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
		expect(preview!.width / preview!.height).toBeCloseTo(1920 / 1080, 2);
		await page.getByRole("button", { name: "Take a photo" }).click();
		await savePhoto(page);
		await expect(page.getByText("Saved privately for the host.")).toBeVisible({
			timeout: 10_000,
		});
		const actions = await page.locator(".actions").boundingBox();
		expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport.height);
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
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
		test.slow();
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Connect", exact: true }).click();
		await expect(page.getByText("LIVE", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Photo mode" }).click();
		await expect(page.locator(".booth-snow")).toBeHidden();
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
		const capture = await page
			.getByRole("button", { name: "Take a photo" })
			.boundingBox();
		const voice = await page
			.getByRole("button", { name: "Enable voice capture" })
			.boundingBox();
		expect(capture!.y).toBe(voice!.y);
		expect(capture!.width).toBeGreaterThan(voice!.width * 2);
		expect(voice!.x + voice!.width).toBeLessThanOrEqual(viewport.width);
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
		await savePhoto(page);
		await expect(page.getByText("Saved privately for the host.")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.locator(".booth-gallery")).toBeHidden();
		await expect(page.locator(".booth-preview")).toHaveClass(/is-photo-mode/);
		await expect(
			page.getByRole("button", { name: "Take a photo" }),
		).toBeEnabled();
		await page.keyboard.press("Escape");
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

// Box centers in public/frames/photobooth3.png, as fractions of its width.
const DEFAULT_FRAME_BOXES = [0.174, 0.496, 0.821];

/** Names the left|right colors inside each default-frame box. */
async function boxColors(page: Page, source: "preview" | "photo" = "preview") {
	const element =
		source === "preview"
			? page.getByLabel("Live photo booth preview")
			: page.getByAltText("A moment at the baby shower");
	return element.evaluate((element, boxes) => {
		const media = element as HTMLCanvasElement | HTMLImageElement;
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d")!;
		if (media instanceof HTMLImageElement) {
			// The 6x4 print pads the 16:9 frame above and below.
			canvas.width = media.naturalWidth;
			canvas.height = (media.naturalWidth * 1080) / 1920;
			context.drawImage(
				media,
				0,
				(media.naturalHeight - canvas.height) / 2,
				canvas.width,
				canvas.height,
				0,
				0,
				canvas.width,
				canvas.height,
			);
		} else {
			canvas.width = media.width;
			canvas.height = media.height;
			context.drawImage(media, 0, 0);
		}
		const name = (x: number) => {
			const [r, g, b] = context.getImageData(
				Math.round(canvas.width * x),
				Math.round(canvas.height * 0.65),
				1,
				1,
			).data;
			if (
				Math.abs(r - 218) < 25 &&
				Math.abs(g - 237) < 25 &&
				Math.abs(b - 247) < 25
			)
				return "empty";
			if (r > 180 && g < 70 && b < 70) return "red";
			if (g > 180 && r < 70 && b < 70) return "green";
			if (b > 180 && r < 70 && g < 70) return "blue";
			if (r > 180 && g > 180 && b < 70) return "yellow";
			return `rgb(${r},${g},${b})`;
		};
		return boxes.map((x) => `${name(x - 0.06)}|${name(x + 0.06)}`);
	}, DEFAULT_FRAME_BOXES);
}

async function controlCameraFill(page: Page) {
	await page.addInitScript(() => {
		const state = { fill: "" };
		Object.assign(window, { cameraFill: state });
		navigator.mediaDevices.getUserMedia = async () => {
			const source = document.createElement("canvas");
			source.width = 320;
			source.height = 180;
			const context = source.getContext("2d")!;
			const paint = () => {
				if (state.fill) {
					context.fillStyle = state.fill;
					context.fillRect(0, 0, 320, 180);
				} else {
					context.fillStyle = "#00ff00";
					context.fillRect(0, 0, 160, 180);
					context.fillStyle = "#ff0000";
					context.fillRect(160, 0, 160, 180);
				}
				requestAnimationFrame(paint);
			};
			paint();
			return source.captureStream(10);
		};
	});
	return (fill: string) =>
		page.evaluate((fill) => {
			(window as Window & { cameraFill?: { fill: string } }).cameraFill!.fill =
				fill;
		}, fill);
}

test("camera interruption mid-sequence resets every box and reconnect restores capture", async ({
	page,
}) => {
	test.slow();
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
	const progress = page.locator(".preview").getByRole("status");
	await expect(progress).toHaveText("Photo 2 of 3", { timeout: 10_000 });
	await page.locator("video").evaluate((video: HTMLVideoElement) => {
		const stream = video.srcObject;
		if (!(stream instanceof MediaStream))
			throw new Error("Camera stream is missing.");
		stream.getVideoTracks()[0].dispatchEvent(new Event("mute"));
	});
	await expect(
		page.getByRole("alert").filter({ hasText: "Camera paused" }),
	).toBeVisible();
	await expect(progress).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeDisabled();
	await expect(
		page.getByRole("button", { name: "Connect", exact: true }),
	).toBeEnabled();
	await page.waitForTimeout(6200);
	expect(uploads).toBe(0);
	expect(
		await page.evaluate(
			() =>
				(
					window as Window & { boothAudioEvents?: { kind: string }[] }
				).boothAudioEvents?.filter((event) => event.kind === "shutter").length,
		),
	).toBe(1);
	await expect(page.getByAltText("A moment at the baby shower")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save photo" })).toHaveCount(0);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect
		.poll(() => boxColors(page))
		.toEqual(["red|green", "empty|empty", "empty|empty"]);
});

test("three-box frame shoots each box in turn, then reviews, retakes and saves one photo", async ({
	page,
}) => {
	test.slow();
	const setCameraFill = await controlCameraFill(page);
	const uploaded = await mockSavedCapture(page);
	let uploads = 0;
	page.on("request", (request) => {
		if (request.method() === "POST" && request.url().endsWith("/api/photos"))
			uploads++;
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
	const capture = page.getByRole("button", { name: "Take a photo" });
	await expect(capture).toBeEnabled();
	// Only the next box shows the (mirrored) camera; the rest stay empty.
	await expect
		.poll(() => boxColors(page))
		.toEqual(["red|green", "empty|empty", "empty|empty"]);

	await capture.click();
	const progress = page.locator(".preview").getByRole("status");
	await expect(progress).toHaveText("Photo 1 of 3");
	for (const value of [5, 4, 3, 2, 1]) {
		await expect(
			page.locator(".preview").getByText(String(value), { exact: true }),
		).toBeVisible();
	}
	await expect(progress).toHaveText("Photo 2 of 3");
	await setCameraFill("#0000ff");
	// The first shot stays frozen while the second box goes live.
	await expect
		.poll(() => boxColors(page))
		.toEqual(["red|green", "blue|blue", "empty|empty"]);
	await expect(progress).toHaveText("Photo 3 of 3", { timeout: 10_000 });
	await setCameraFill("#ffff00");
	await expect
		.poll(() => boxColors(page))
		.toEqual(["red|green", "blue|blue", "yellow|yellow"]);

	const save = page.getByRole("button", { name: "Save photo" });
	await expect(save).toBeVisible({ timeout: 10_000 });
	await expect(capture).toHaveCount(0);
	await expect
		.poll(() => boxColors(page, "photo"))
		.toEqual(["red|green", "blue|blue", "yellow|yellow"]);
	expect(uploads).toBe(0);
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
	const shot = [...Array(5).fill("countdown"), "shutter"];
	expect(sounds?.map((sound) => sound.kind)).toEqual([
		...shot,
		...shot,
		...shot,
	]);
	expect(sounds?.slice(0, 5).every((sound) => sound.frequency === 880)).toBe(
		true,
	);
	expect(sounds?.[5]).toMatchObject({
		duration: expect.closeTo(0.18, 2),
		hasSignal: true,
	});
	for (let index = 1; index < 6; index++) {
		expect(sounds![index].time - sounds![index - 1].time).toBeGreaterThan(700);
	}
	expect(sounds![5].time - sounds![0].time).toBeGreaterThanOrEqual(4_900);

	await page.getByRole("button", { name: "Retake" }).click();
	await expect(progress).toHaveText("Photo 1 of 3");
	await expect(page.getByAltText("A moment at the baby shower")).toHaveCount(0);
	await expect
		.poll(() => boxColors(page))
		.toEqual(["yellow|yellow", "empty|empty", "empty|empty"]);
	await setCameraFill("");
	await savePhoto(page);
	await expect(
		page.getByAltText("Baby-shower memory captured.jpg"),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Saved privately for the host.")).toBeVisible();
	await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(
		0,
	);
	expect(uploads).toBe(1);
	expect(uploaded()!.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
	await expect(capture).toBeEnabled();
	await expect
		.poll(() => boxColors(page))
		.toEqual(["red|green", "empty|empty", "empty|empty"]);
});

for (const failure of ["unconfigured", "offline"]) {
	test(`download is a fallback when photo saving is ${failure}, and retry can recover`, async ({
		page,
	}) => {
		test.slow();
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
		if (failure === "offline")
			await page.getByRole("button", { name: "Photo mode" }).click();
		await page.getByRole("button", { name: "Take a photo" }).click();
		await savePhoto(page);
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
	test.slow();
	let attempts = 0;
	await page.route("**/api/photos", (route) => {
		attempts++;
		return route.fulfill({ json: { saved: true } });
	});
	await page.addInitScript(() => {
		HTMLCanvasElement.prototype.toBlob = (callback) => {
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
	await savePhoto(page);
	await expect(
		page.getByRole("alert").filter({ hasText: "4 MB upload limit" }),
	).toBeVisible({ timeout: 10_000 });
	await expect(
		page.getByRole("link", { name: "Download photo" }),
	).toBeVisible();
	expect(attempts).toBe(0);
});

test("saving prevents another capture and an unconfirmed save can be discarded", async ({
	page,
}) => {
	test.slow();
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
	await savePhoto(page);
	await expect(page.getByText("Saving photo…")).toBeVisible({
		timeout: 10_000,
	});
	await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Take a photo" })).toHaveCount(
		0,
	);
	await expect(page.getByRole("button", { name: "Discard photo" })).toHaveCount(
		0,
	);
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
	await expect(
		page.getByRole("button", { name: "Discard photo" }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Discard photo" }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect(page.getByAltText("A moment at the baby shower")).toHaveCount(0);
});

test("saving optimistically reserves one upload and rolls back when the save fails", async ({
	page,
}) => {
	test.slow();
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
	await savePhoto(page);
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
	).toHaveCount(0);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	const sample = () =>
		page
			.getByLabel("Live photo booth preview")
			.evaluate((source: HTMLCanvasElement, x) => {
				const canvas = document.createElement("canvas");
				canvas.width = source.width;
				canvas.height = source.height;
				const context = canvas.getContext("2d")!;
				context.drawImage(source, 0, 0);
				return Array.from(
					context.getImageData(
						Math.round(source.width * x),
						Math.round(source.height * 0.65),
						1,
						1,
					).data,
				);
			}, DEFAULT_FRAME_BOXES[0]);
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

test("admin uploads a shared default frame and guests use it without a frame picker", async ({
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
	await expect(
		page.getByRole("region", { name: "Choose a frame" }),
	).toHaveCount(0);
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
	await page
		.locator("figure")
		.filter({ hasText: "garden" })
		.getByRole("button", { name: "Make booth default" })
		.click();
	await expect(
		page
			.locator("figure")
			.filter({ hasText: "garden" })
			.getByText("· Booth default"),
	).toBeVisible();
	await context.addCookies([sessionCookie()]);
	await page.goto("/");
	const carousel = page.getByRole("region", { name: "Choose a frame" });
	await expect(carousel).toHaveCount(0);
	await page.getByRole("button", { name: "Connect", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Take a photo" }),
	).toBeEnabled();
	await expect
		.poll(() =>
			page
				.getByLabel("Live photo booth preview")
				.evaluate((source: HTMLCanvasElement) => {
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
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(carousel).toHaveCount(0);
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
	await expect(
		page.getByRole("alert").filter({ hasText: "Could not load backdrops" }),
	).toHaveCount(0);
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
	await page.addInitScript(() =>
		localStorage.setItem(
			"photo-booth-preferences",
			JSON.stringify({
				state: {
					background: "/frames/baby-shower.png",
					backgroundChosen: true,
				},
				version: 0,
			}),
		),
	);
	await page.goto("/");
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					JSON.parse(localStorage.getItem("photo-booth-preferences")!).state
						.background,
			),
		)
		.toContain("_garden.jpg");
	await expect(page.locator(".background-option")).toHaveCount(0);
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
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					JSON.parse(localStorage.getItem("photo-booth-preferences")!).state
						.background,
			),
		)
		.toBe("/frames/baby-shower.png");
});

for (const interim of [false, true]) {
	test(`voice capture starts one countdown and can capture again after saving (${interim ? "interim" : "final"} results)`, async ({
		page,
	}) => {
		test.slow();
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
		const inactiveBackground = await page
			.getByRole("button", { name: "Enable voice capture" })
			.evaluate((button) => getComputedStyle(button).backgroundColor);
		await page.getByRole("button", { name: "Enable voice capture" }).click();
		await expect(
			page.getByRole("status").filter({ hasText: "Listening for" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Stop voice capture" }),
		).toHaveAttribute("aria-pressed", "true");
		await expect
			.poll(() =>
				page
					.getByRole("button", { name: "Stop voice capture" })
					.evaluate((button) => getComputedStyle(button).backgroundColor),
			)
			.not.toBe(inactiveBackground);
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
		await savePhoto(page);
		await expect(page.getByText("Saved privately for the host.")).toBeVisible({
			timeout: 10_000,
		});
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
		await savePhoto(page);
		await expect(page.getByText("Saved privately for the host.")).toBeVisible({
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
			30,
		);
		expect(audio?.filter((event) => event.kind === "shutter")).toHaveLength(6);
	});
}

test("audio failure is explicit but does not prevent capture and saving", async ({
	page,
}) => {
	test.slow();
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
	await savePhoto(page);
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
		"rgb(39, 76, 99)",
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
		"rgb(39, 76, 99)",
	);
	const gallery = page.getByRole("region", {
		name: "Saved photos",
		exact: true,
	});
	await expect(
		gallery.getByAltText("Baby-shower memory newest.jpg"),
	).toBeVisible();
	await expect
		.poll(() =>
			gallery
				.getByAltText("Baby-shower memory newest.jpg")
				.evaluate((image: HTMLImageElement) => image.naturalWidth),
		)
		.toBe(1153);
	await expect(
		page.getByRole("button", { name: "Open photo newest.jpg" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Open photo newest.jpg" }).click();
	await expect(
		page.getByRole("dialog", { name: "Photo memory" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Load more photos" }).click();
	await expect(
		gallery.getByAltText("Baby-shower memory older.jpg"),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Load more photos" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Refresh photos" }).click();
	await expect(
		gallery.getByAltText("Baby-shower memory older.jpg"),
	).toHaveCount(0);
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
		gallery.getByAltText("Baby-shower memory newest.jpg"),
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
		page.getByRole("button", { name: "Open photo kept.jpg" }),
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
