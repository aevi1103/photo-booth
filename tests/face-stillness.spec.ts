import { expect, test } from "@playwright/test";
import { createFaceStillnessTracker } from "../lib/face-stillness";

const face = { originX: 100, originY: 100, width: 100, height: 100 };

test("requires a continuously detected still face for three seconds", () => {
	const tracker = createFaceStillnessTracker();
	for (let time = 0; time < 3_000; time += 250)
		expect(tracker.update([face], time)).toBe(false);
	expect(tracker.update([face], 2_999)).toBe(false);
	expect(tracker.update([face], 3_000)).toBe(true);
	expect(tracker.update([], 3_250)).toBe(false);
	expect(tracker.update([face], 3_500)).toBe(false);
});

test("movement, face replacement and missed samples reset the timer", () => {
	const tracker = createFaceStillnessTracker();
	for (let time = 0; time <= 2_000; time += 250) tracker.update([face], time);
	const moved = { ...face, originX: face.originX + 9 };
	expect(tracker.update([moved], 2_250)).toBe(false);
	for (let time = 2_500; time < 5_250; time += 250)
		expect(tracker.update([moved], time)).toBe(false);
	expect(tracker.update([moved], 5_250)).toBe(true);
	expect(tracker.update([face], 6_250)).toBe(false);
	expect(tracker.update([{ ...face, originX: 400 }], 6_500)).toBe(false);
});

test("tracks multiple faces independently when their order changes", () => {
	const tracker = createFaceStillnessTracker();
	const other = { ...face, originX: 400 };
	for (let time = 0; time < 3_000; time += 250) {
		const moving = { ...other, originY: other.originY + time / 250 };
		expect(
			tracker.update(time % 500 ? [face, moving] : [moving, face], time),
		).toBe(false);
	}
	expect(tracker.update([other, face], 3_000)).toBe(true);
	tracker.reset();
	expect(tracker.update([face], 3_250)).toBe(false);
});

test("small cumulative movement and invalid frames cannot inherit stillness", () => {
	const tracker = createFaceStillnessTracker();
	const reused = { ...face };
	for (let time = 0; time <= 2_000; time += 250) {
		reused.originX = face.originX + time / 250;
		expect(tracker.update([reused], time)).toBe(false);
	}
	reused.originX += 1;
	expect(tracker.update([reused], 2_250)).toBe(false);
	for (let time = 2_500; time < 5_250; time += 250)
		expect(tracker.update([reused], time)).toBe(false);
	expect(tracker.update([{ ...reused, width: 0 }], 5_250)).toBe(false);
	expect(tracker.update([reused], 5_500)).toBe(false);
});
