export type FrameSize = { width: number; height: number };
export type Opening = { x: number; y: number; width: number; height: number };

// The compositor has one frozen-shot texture per opening.
export const MAX_FRAME_OPENINGS = 3;
// Transparent gaps smaller than this share of the largest opening are artwork
// details (e.g. inside lettering), not photo boxes.
const MIN_OPENING_SHARE = 0.2;

type Region = { area: number; interior: boolean; opening: Opening };

// Left-to-right for side-by-side boxes, top-to-bottom for stacked ones.
function readingOrder(a: Opening, b: Opening) {
	const overlapsHorizontally = a.x < b.x + b.width && b.x < a.x + a.width;
	return overlapsHorizontally ? a.y - b.y : a.x - b.x;
}

export function getFrameOpenings(image: HTMLImageElement): Opening[] {
	const { naturalWidth: width, naturalHeight: height } = image;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context)
		throw new Error("Could not read the photo frame's transparency.");
	context.drawImage(image, 0, 0);
	const { data } = context.getImageData(0, 0, width, height);
	const queue = new Uint32Array(width * height);
	const regions: Region[] = [];

	for (let pixel = 0; pixel < width * height; pixel++) {
		// Ignore nearly opaque antialiasing when finding the photo openings.
		if (data[pixel * 4 + 3] >= 128) continue;
		let head = 0;
		let tail = 1;
		queue[0] = pixel;
		data[pixel * 4 + 3] = 255;
		let left = width;
		let right = 0;
		let top = height;
		let bottom = 0;
		const visit = (neighbor: number) => {
			if (data[neighbor * 4 + 3] >= 128) return;
			data[neighbor * 4 + 3] = 255;
			queue[tail++] = neighbor;
		};
		while (head < tail) {
			const index = queue[head++];
			const x = index % width;
			const y = Math.floor(index / width);
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
			if (x > 0) visit(index - 1);
			if (x < width - 1) visit(index + 1);
			if (y > 0) visit(index - width);
			if (y < height - 1) visit(index + width);
		}
		regions.push({
			area: tail,
			interior: left > 0 && top > 0 && right < width - 1 && bottom < height - 1,
			opening: {
				x: left / width,
				y: top / height,
				width: (right - left + 1) / width,
				height: (bottom - top + 1) / height,
			},
		});
	}

	const interior = regions.filter((region) => region.interior);
	if (!interior.length) {
		const largest = regions.reduce<Region | undefined>(
			(best, region) => (!best || region.area > best.area ? region : best),
			undefined,
		);
		return [largest?.opening ?? { x: 0, y: 0, width: 1, height: 1 }];
	}
	const largestArea = Math.max(...interior.map((region) => region.area));
	return interior
		.filter((region) => region.area >= largestArea * MIN_OPENING_SHARE)
		.sort((a, b) => b.area - a.area)
		.slice(0, MAX_FRAME_OPENINGS)
		.map((region) => region.opening)
		.sort(readingOrder);
}
