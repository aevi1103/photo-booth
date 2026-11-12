export type FrameSize = { width: number; height: number };
type Opening = { x: number; y: number; width: number; height: number };

export function getFrameOpening(image: HTMLImageElement): Opening {
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
	let largest: { area: number; opening: Opening } | undefined;
	let interior: typeof largest;

	for (let pixel = 0; pixel < width * height; pixel++) {
		// Ignore nearly opaque antialiasing when finding the photo opening.
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
		const region = {
			area: tail,
			opening: {
				x: left / width,
				y: top / height,
				width: (right - left + 1) / width,
				height: (bottom - top + 1) / height,
			},
		};
		if (!largest || region.area > largest.area) largest = region;
		if (
			left > 0 &&
			top > 0 &&
			right < width - 1 &&
			bottom < height - 1 &&
			(!interior || region.area > interior.area)
		)
			interior = region;
	}

	return (interior ?? largest)?.opening ?? { x: 0, y: 0, width: 1, height: 1 };
}
