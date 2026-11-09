import { expect, test } from "./fixtures";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const source = document.createElement("canvas");
    source.width = 320; source.height = 180;
    const context = source.getContext("2d")!;
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = source.captureStream(10);
      const paint = () => {
        context.fillStyle = "#00ff00"; context.fillRect(0, 0, 160, 180);
        context.fillStyle = "#ff0000"; context.fillRect(160, 0, 160, 180);
        requestAnimationFrame(paint);
      };
      paint();
      return stream;
    };
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mobile camera switching, framed capture, and upload at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const state = { constraints: [] as MediaStreamConstraints[], streams: [] as MediaStream[] };
      Object.assign(window, { mobileCameraTest: state });
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        state.constraints.push(constraints ?? {});
        const source = document.createElement("canvas");
        source.width = 180; source.height = 320;
        const context = source.getContext("2d")!;
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, source.width, source.height);
        const stream = source.captureStream(10);
        state.streams.push(stream);
        return stream;
      };
    });
    await page.route("**/api/photos", (route) => route.fulfill({ json: { saved: true } }));
    await page.goto("/");
    if (viewport.width <= 800) await page.getByRole("button", { name: "Show settings", exact: true }).click();
    await page.getByLabel("CAMERA", { exact: true }).selectOption("facing:user");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
    await page.getByLabel("CAMERA", { exact: true }).selectOption("facing:environment");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
    const captureButton = await page.getByRole("button", { name: "Take a photo" }).boundingBox();
    const voiceButton = await page.getByRole("button", { name: "Enable voice capture" }).boundingBox();
    expect(captureButton).not.toBeNull();
    expect(voiceButton).not.toBeNull();
    expect(captureButton!.y).toBe(voiceButton!.y);
    const state = await page.evaluate(() => {
      const state = (window as Window & { mobileCameraTest?: { constraints: MediaStreamConstraints[]; streams: MediaStream[] } }).mobileCameraTest;
      if (!state) throw new Error("Mobile camera test state is missing.");
      return { constraints: state.constraints, previousTrack: state.streams[0].getVideoTracks()[0].readyState, liveTrack: state.streams[1].getVideoTracks()[0].readyState };
    });
    expect(state.constraints).toMatchObject([
      { audio: false, video: { facingMode: { exact: "user" } } },
      { audio: false, video: { facingMode: { exact: "environment" } } },
    ]);
    expect(state.previousTrack).toBe("ended");
    expect(state.liveTrack).toBe("live");
    const video = page.locator("video");
    await expect(video).toHaveAttribute("playsinline", "");
    await expect(video).not.toHaveCSS("display", "none");
    await expect.poll(() => page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Take a photo" }).click();
    await expect(page.getByLabel("CAMERA", { exact: true })).toBeDisabled();
    await expect(page.getByAltText("Your captured photo")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Saved privately for the host.")).toBeVisible();
    const dimensions = await page.getByAltText("Your captured photo").evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }));
    expect(dimensions).toEqual({ width: 180, height: Math.round(180 * 768 / 1153) });
  });
}

test("mobile puts booth first and toggles settings without stopping the camera or resetting options", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Show settings", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("CAMERA", { exact: true })).toBeHidden();
  await expect(page.locator(".booth-preview")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".booth-preview")).toHaveCSS("padding-left", "0px");
  await expect(page.locator(".booth-preview")).toHaveCSS("box-shadow", "none");
  const previewWidth = await page.locator(".preview").evaluate((element) => element.getBoundingClientRect().width);
  expect(previewWidth).toBeGreaterThanOrEqual(350);
  await expect(page.getByText("A few little details", { exact: true })).toHaveCount(0);
  const buttons = await page.locator(".actions").evaluate((actions) => Array.from(actions.querySelectorAll("button")).map((button) => button.getBoundingClientRect().y));
  expect(buttons).toHaveLength(2);
  expect(buttons[0]).toBe(buttons[1]);
  await expect(page.getByRole("button", { name: "Take a photo" })).toHaveCSS("background-color", "rgb(86, 142, 174)");
  await expect(page.getByRole("button", { name: "Enable voice capture" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Enable voice capture" })).toHaveCSS("border-top-style", "dashed");
  const preview = await page.locator(".preview-card").boundingBox();
  const settings = await page.locator("aside.controls-card").boundingBox();
  expect(preview).not.toBeNull();
  expect(settings).not.toBeNull();
  expect(settings!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height);
  await toggle.click();
  await page.getByLabel("Mirror photo and preview").check();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide settings", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("CAMERA", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await toggle.click();
  await expect(page.getByLabel("Mirror photo and preview")).toBeChecked();
  await page.getByRole("button", { name: "Hide settings", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByLabel("CAMERA", { exact: true })).toBeVisible();
  await expect(toggle).toBeHidden();
});

for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
  test(`camera ${name} shows recovery instructions and allows retry`, async ({ page }) => {
    await page.addInitScript((name) => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Test camera failure", name); };
    }, name);
    await page.goto("/");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const text = name === "NotAllowedError" ? "Allow camera access" : name === "NotFoundError" ? "That camera is unavailable" : "The camera is busy";
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Take a photo" })).toBeDisabled();
  });
}

test("camera interruption cancels countdown and reconnect restores capture", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/photos", (route) => { uploads++; return route.fulfill({ json: { saved: true } }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await page.getByRole("button", { name: "Take a photo" }).click();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    const stream = video.srcObject;
    if (!(stream instanceof MediaStream)) throw new Error("Camera stream is missing.");
    stream.getVideoTracks()[0].dispatchEvent(new Event("mute"));
  });
  await expect(page.getByRole("alert").filter({ hasText: "Camera paused" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
  await page.waitForTimeout(3200);
  expect(uploads).toBe(0);
  await expect(page.getByAltText("Your captured photo")).toHaveCount(0);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
});

test("frame and camera appear in preview and are automatically uploaded without a download step", async ({ page }) => {
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
  await expect.poll(() => page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const cameraLeft = ctx.getImageData(80, 90, 1, 1).data;
    const cameraRight = ctx.getImageData(180, 90, 1, 1).data;
    const border = ctx.getImageData(5, 5, 1, 1).data;
    const openingBehindText = ctx.getImageData(Math.round(source.width * 710 / 1153), Math.round(source.height * 145 / 768), 1, 1).data;
    return cameraLeft[1] > 200 && cameraLeft[0] < 30 &&
      cameraRight[0] > 200 && cameraRight[1] < 30 &&
      openingBehindText[0] > 200 && openingBehindText[1] < 30 &&
      !(border[1] > 200 && border[0] < 30);
  })).toBe(true);
  await capture.click();
  await expect(page.getByAltText("Your captured photo")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Saved privately for the host.")).toBeVisible();
  const matches = await page.getByAltText("Your captured photo").evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const left = context.getImageData(80, 90, 1, 1).data;
    const right = context.getImageData(180, 90, 1, 1).data;
    const border = context.getImageData(5, 5, 1, 1).data;
    const openingBehindText = context.getImageData(Math.round(canvas.width * 710 / 1153), Math.round(canvas.height * 145 / 768), 1, 1).data;
    return left[1] > 180 && left[0] < 50 && right[0] > 180 && right[1] < 50 &&
      openingBehindText[0] > 180 && openingBehindText[1] < 50 &&
      !(border[1] > 180 && border[0] < 50);
  });
  expect(matches).toBe(true);
  const capturedBytes = await page.getByAltText("Your captured photo").evaluate(async (image: HTMLImageElement) => {
    const response = await fetch(image.src);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  });
  expect(Buffer.from(capturedBytes)).toEqual(uploaded);
  await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(capture).toBeVisible();
});

for (const failure of ["unconfigured", "offline"]) {
  test(`download is a fallback when photo saving is ${failure}, and retry can recover`, async ({ page }) => {
    let attempts = 0;
    let uploaded: Buffer | null = null;
    await page.route("**/api/photos", async (route) => {
      uploaded = route.request().postDataBuffer();
      attempts++;
      if (attempts === 1) {
        if (failure === "offline") { await route.abort("internetdisconnected"); return; }
        await route.fulfill({ status: 503, json: { error: "Online photo saving is not configured." } });
        return;
      }
      await route.fulfill({ json: { saved: true } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
    await page.getByRole("button", { name: "Take a photo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Not saved online:" })).toBeVisible({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download photo" }).click();
    const download = await downloadPromise;
    expect(await readFile(await download.path())).toEqual(uploaded);
    await page.getByRole("button", { name: "Retry saving" }).click();
    await expect(page.getByText("Saved privately for the host.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}

test("saving prevents retake and only confirmed saves hide the fallback", async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/photos", async (route) => {
    await pending;
    await route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await page.getByRole("button", { name: "Take a photo" }).click();
  await expect(page.getByText("Saving photo…")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Retake" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Download photo" })).toHaveCount(0);
  release?.();
  await expect(page.getByRole("alert").filter({ hasText: "did not confirm" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeEnabled();
});

test("local background replaces green only when enabled", async ({ page }) => {
  await page.route("**/images/photoboot-bg.jpeg", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="blue"/></svg>',
  }));
  await page.addInitScript(() => {
    const source = document.createElement("canvas");
    source.width = 320; source.height = 180;
    const context = source.getContext("2d")!;
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = source.captureStream(10);
      const paint = () => {
        context.fillStyle = "#00ff00"; context.fillRect(0, 0, 320, 180);
        requestAnimationFrame(paint);
      };
      paint();
      return stream;
    };
  });
  await page.goto("/");
  await page.getByLabel("Replace green screen").check();
  await expect(page.getByRole("button", { name: "photoboot bg" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await expect.poll(() => page.locator("canvas").evaluate((source: HTMLCanvasElement) => {
    const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext("2d")!; context.drawImage(source, 0, 0);
    const left = context.getImageData(80, 90, 1, 1).data;
    const behindText = context.getImageData(Math.round(source.width * 710 / 1153), Math.round(source.height * 145 / 768), 1, 1).data;
    return left[2] > 200 && left[1] < 30 && behindText[2] > 200 && behindText[1] < 30;
  })).toBe(true);
});

test("voice capture starts one countdown and can capture again after retake", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onresult: ((event: object) => void) | null = null;
      onerror: ((event: object) => void) | null = null;
      onend: (() => void) | null = null;
      start() { this.onstart?.(); }
      abort() { this.onend?.(); }
      constructor() { Object.assign(window, { fakeRecognition: this }); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await page.route("**/api/photos", (route) => route.fulfill({ json: { saved: true } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listening for" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop voice capture" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Stop voice capture" })).toHaveCSS("border-top-style", "solid");
  await expect(page.getByRole("button", { name: "Stop voice capture" })).toHaveCSS("color", "rgb(56, 121, 92)");
  const speak = (text: string) => page.evaluate((transcript) => {
    const recognition = (window as Window & { fakeRecognition?: { onresult: (event: object) => void } }).fakeRecognition;
    if (!recognition) throw new Error("Fake recognition not initialized");
    recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript } }] });
  }, text);
  await speak("recaptured");
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await speak("Capture!");
  await speak("capture");
  await expect(page.getByRole("button", { name: "Get ready" })).toBeDisabled();
  await expect(page.getByAltText("Your captured photo")).toBeVisible({ timeout: 10_000 });
  await speak("capture");
  await expect(page.getByAltText("Your captured photo")).toBeVisible();
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
  await speak("capture");
  await expect(page.getByAltText("Your captured photo")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Stop voice capture" }).click();
  await expect(page.getByText("Voice control is off.")).toBeVisible();
});

test("voice control reports microphone errors and remains optional", async ({ page }) => {
  await page.addInitScript(() => {
    class DeniedRecognition {
      onerror: ((event: object) => void) | null = null;
      start() { this.onerror?.({ error: "not-allowed" }); }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: DeniedRecognition, webkitSpeechRecognition: DeniedRecognition });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "permission was denied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable voice capture" })).toBeVisible();
});

test("voice control retries a network failure and reports a useful error", async ({ page }) => {
  await page.addInitScript(() => {
    class NetworkRecognition {
      onerror: ((event: object) => void) | null = null;
      onend: (() => void) | null = null;
      starts = 0;
      start() {
        this.starts++;
        queueMicrotask(() => { this.onerror?.({ error: "network" }); this.onend?.(); });
      }
      abort() { this.onend?.(); }
      constructor() { Object.assign(window, { fakeRecognition: this }); }
    }
    Object.assign(window, { SpeechRecognition: NetworkRecognition, webkitSpeechRecognition: NetworkRecognition });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Retrying" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "speech service" })).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (window as Window & { fakeRecognition?: { starts: number } }).fakeRecognition?.starts)).toBe(3);
  await expect(page.getByRole("button", { name: "Enable voice capture" })).toBeVisible();
});

test("voice control restarts after recognition ends and stops when requested", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      starts = 0;
      start() { this.starts++; this.onstart?.(); }
      abort() { this.onend?.(); }
      constructor() { Object.assign(window, { fakeRecognition: this }); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await page.evaluate(() => {
    const recognition = (window as Window & { fakeRecognition?: { onend: () => void } }).fakeRecognition;
    if (!recognition) throw new Error("Fake recognition not initialized");
    recognition.onend();
  });
  await expect.poll(() => page.evaluate(() => (window as Window & { fakeRecognition?: { starts: number } }).fakeRecognition?.starts)).toBe(2);
  await page.getByRole("button", { name: "Stop voice capture" }).click();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as Window & { fakeRecognition?: { starts: number } }).fakeRecognition?.starts)).toBe(2);
});

test("unsupported voice recognition leaves the manual camera control available", async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }));
  await page.goto("/");
  await page.getByRole("button", { name: "Enable voice capture" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not supported" })).toBeVisible();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take a photo" })).toBeEnabled();
});

test("photo endpoint rejects wrong media type and invalid JPEG", async ({ request }) => {
  const invalidType = await request.post("/api/photos", { headers: { "content-type": "text/plain" }, data: "x" });
  expect(invalidType.status()).toBe(415);
  const invalidImage = await request.post("/api/photos", { headers: { "content-type": "image/jpeg" }, data: "x" });
  expect(invalidImage.status()).toBe(400);
});

test("photo endpoint stores the JPEG in the user's private folder without a booth code", async ({ request, backend }) => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  const result = await request.post("/api/photos", {
    headers: { "content-type": "image/jpeg" }, data: image,
  });
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ saved: true, quota: { used: 1, remaining: 19 } });
  expect([...backend.objects.keys()][0]).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.jpg$/);
  expect([...backend.objects.values()][0]).toEqual(image);
});

test("authenticated gallery browses pages and refreshes with the booth theme", async ({ page }) => {
    const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1153" height="768"><rect width="1153" height="768" fill="skyblue"/></svg>');
    let requests = 0;
    await page.route("**/api/photos?offset=*", async (route) => {
      requests++;
      expect(route.request().headers()["x-booth-code"]).toBeUndefined();
      const offset = new URL(route.request().url()).searchParams.get("offset");
      await route.fulfill({ json: {
        photos: [{ name: offset === "0" ? "newest.jpg" : "older.jpg", createdAt: "2026-11-09T12:00:00Z", url: image }],
        nextOffset: offset === "0" ? 24 : null,
      } });
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "View gallery" })).toHaveCSS("color", "rgb(85, 142, 174)");
    await page.getByRole("link", { name: "View gallery" }).click();
    await page.mouse.move(0, 0);
    await expect(page.getByRole("heading", { name: "Photo gallery" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Photo gallery" })).toHaveCSS("color", "rgb(52, 93, 118)");
    await expect(page.getByRole("link", { name: "Back to booth" })).toHaveCSS("color", "rgb(85, 142, 174)");
    await expect(page.getByAltText("Saved photo newest.jpg")).toBeVisible();
    await expect.poll(() => page.getByAltText("Saved photo newest.jpg").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1153);
    await expect(page.getByRole("link", { name: "Open photo newest.jpg" })).toHaveAttribute("target", "_blank");
    await page.getByRole("button", { name: "Load more photos" }).click();
    await expect(page.getByAltText("Saved photo older.jpg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more photos" })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh photos" }).click();
    await expect(page.getByAltText("Saved photo older.jpg")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("access_token");
    await page.reload();
    await expect(page.getByAltText("Saved photo newest.jpg")).toBeVisible();
    expect(requests).toBeGreaterThanOrEqual(4);
  });

  test("gallery shows connection, empty-state and expired-image errors", async ({ page }) => {
    let mode: "unavailable" | "offline" | "empty" | "expired" = "unavailable";
    await page.route("**/api/photos?offset=*", async (route) => {
      if (mode === "unavailable") {
        await route.fulfill({ status: 503, json: { error: "Could not load photos. Please retry." } });
      } else if (mode === "offline") {
        await route.abort("internetdisconnected");
      } else if (mode === "empty") {
        await route.fulfill({ json: { photos: [], nextOffset: null } });
      } else {
        await route.fulfill({ json: { photos: [{ name: "expired.jpg", createdAt: "2026-11-09T12:00:00Z", url: "/expired-image.jpg" }], nextOffset: null } });
      }
    });
    await page.route("**/expired-image.jpg", (route) => route.fulfill({ status: 403, body: "" }));
    await page.goto("/gallery");
    await expect(page.getByRole("alert").filter({ hasText: "Could not load photos" })).toBeVisible();
    mode = "offline";
    await page.getByRole("button", { name: "Refresh photos" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /fetch/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh photos" })).toBeEnabled();
    mode = "empty";
    await page.getByRole("button", { name: "Refresh photos" }).click();
    await expect(page.getByText("No photos yet.", { exact: false })).toBeVisible();
    mode = "expired";
    await page.getByRole("button", { name: "Refresh photos" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "link expired" })).toBeVisible();
  });

  test("gallery endpoint paginates private storage and reports storage failures", async ({ request, backend }) => {
    for (const offset of ["-1", "abc", "1.5", "9007199254740991"]) {
      expect((await request.get(`/api/photos?offset=${offset}`)).status()).toBe(400);
    }
    await backend.db.exec("insert into storage.objects(bucket_id, name) select 'photos', '11111111-1111-4111-8111-111111111111/' || i || '.jpg' from generate_series(1, 25) i;");
      const first = await request.get("/api/photos");
      expect(first.status()).toBe(200);
      expect(first.headers()["cache-control"]).toBe("private, no-store");
      const result = await first.json();
      expect(result.photos).toHaveLength(24);
      expect(result.nextOffset).toBe(24);
      expect(result.photos[0].url).toContain("?token=test-token");
      const last = await request.get("/api/photos?offset=24");
      expect(await last.json()).toMatchObject({ nextOffset: null, photos: [expect.objectContaining({ name: expect.any(String) })] });
      await backend.db.exec("delete from storage.objects;");
      expect(await (await request.get("/api/photos")).json()).toEqual({ photos: [], nextOffset: null });
      await backend.db.exec("insert into storage.objects(bucket_id, name) values ('photos', '11111111-1111-4111-8111-111111111111/one.jpg');");
      for (const mode of ["listError", "signError"] as const) {
        backend.listError = false; backend.signError = false;
        backend[mode] = true;
        const failed = await request.get("/api/photos");
        expect(failed.status()).toBe(503);
        expect(await failed.json()).toHaveProperty("error");
      }
  });
