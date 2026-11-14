import { BACKDROP_DIMENSION_ERROR, MAX_BACKDROP_PIXELS } from "@/lib/backdrops";

export type CheckerboardRegion = {
	left: number;
	top: number;
	width: number;
	height: number;
};

// A checkerboard pixel is a light, near-neutral gray: the white and
// light-gray squares editors render where an image would be transparent.
// JPEG compression adds noise, so the match is tolerant.
function isCheckerPixel(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	return max - min <= 18 && min >= 160;
}

/**
 * Finds rectangular regions filled with the gray-and-white "transparency"
 * checkerboard that design tools bake into JPEG exports. A region qualifies
 * when a connected patch of light neutral pixels nearly fills its bounding
 * box and mixes both white and gray squares, so plain white or cream areas
 * of the artwork are left alone.
 */
export function findCheckerboardRegions(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): CheckerboardRegion[] {
	const mask = new Uint8Array(width * height);
	for (let index = 0, offset = 0; index < mask.length; index++, offset += 4)
		if (isCheckerPixel(data[offset], data[offset + 1], data[offset + 2]))
			mask[index] = 1;
	const regions: CheckerboardRegion[] = [];
	const minArea = Math.max(2048, width * height * 0.005);
	const stack: number[] = [];
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start]) continue;
		mask[start] = 0;
		stack.push(start);
		let area = 0;
		let light = 0;
		let gray = 0;
		let left = width;
		let right = 0;
		let top = height;
		let bottom = 0;
		while (stack.length) {
			const index = stack.pop() as number;
			area++;
			const x = index % width;
			const y = (index / width) | 0;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			// Channels are near-equal inside the mask, so red stands in for luma.
			const value = data[index * 4];
			if (value >= 238) light++;
			else if (value <= 230) gray++;
			if (x > 0 && mask[index - 1]) {
				mask[index - 1] = 0;
				stack.push(index - 1);
			}
			if (x < width - 1 && mask[index + 1]) {
				mask[index + 1] = 0;
				stack.push(index + 1);
			}
			if (y > 0 && mask[index - width]) {
				mask[index - width] = 0;
				stack.push(index - width);
			}
			if (y < height - 1 && mask[index + width]) {
				mask[index + width] = 0;
				stack.push(index + width);
			}
		}
		const boxWidth = right - left + 1;
		const boxHeight = bottom - top + 1;
		if (
			area >= minArea &&
			boxWidth >= 24 &&
			boxHeight >= 24 &&
			area >= boxWidth * boxHeight * 0.85 &&
			light >= area * 0.15 &&
			gray >= area * 0.15
		)
			regions.push({ left, top, width: boxWidth, height: boxHeight });
	}
	return regions;
}

async function encode(canvas: HTMLCanvasElement, type: string) {
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));
}

/**
 * Prepares a backdrop file for upload. JPEGs cannot hold transparency, so
 * when one contains a fake "transparent" checkerboard window the window is
 * cleared to real transparency and the image is re-encoded as a PNG (or WebP
 * when the PNG would exceed the size limit). Other files, and JPEGs without
 * a checkerboard window, are returned unchanged. Decoding also validates
 * that the file is a real image.
 */
export async function prepareBackdropFile(
	file: File,
	maxBytes: number,
): Promise<File> {
	const image = await createImageBitmap(file);
	try {
		if (image.width * image.height > MAX_BACKDROP_PIXELS)
			throw new Error(BACKDROP_DIMENSION_ERROR);
		if (file.type !== "image/jpeg") return file;
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext("2d");
		if (!context) return file;
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
		const regions = findCheckerboardRegions(
			pixels.data,
			canvas.width,
			canvas.height,
		);
		if (regions.length === 0) return file;
		for (const region of regions)
			context.clearRect(region.left, region.top, region.width, region.height);
		let blob = await encode(canvas, "image/png");
		if (blob && blob.size > maxBytes) blob = await encode(canvas, "image/webp");
		if (!blob || !["image/png", "image/webp"].includes(blob.type)) return file;
		const extension = blob.type === "image/png" ? "png" : "webp";
		const name = `${file.name.replace(/\.[^.]*$/, "")}.${extension}`;
		return new File([blob], name, { type: blob.type });
	} finally {
		image.close();
	}
}
