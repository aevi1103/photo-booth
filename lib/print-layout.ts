// Saved photos are 6x4 in prints at 300 DPI so they print borderless without scaling.
export const PRINT_DPI = 300;
const LONG_EDGE = 6 * PRINT_DPI;
const SHORT_EDGE = 4 * PRINT_DPI;

/**
 * Lays the composite onto a 6x4 (or 4x6 for portrait art) canvas. The whole
 * composite stays visible; any leftover edge is filled with a blurred,
 * cover-scaled copy so a borderless print has no white bars.
 */
export function renderPrint(source: HTMLCanvasElement) {
	const portrait = source.height > source.width;
	const output = document.createElement("canvas");
	output.width = portrait ? SHORT_EDGE : LONG_EDGE;
	output.height = portrait ? LONG_EDGE : SHORT_EDGE;
	const context = output.getContext("2d");
	if (!context) return null;
	context.imageSmoothingQuality = "high";
	const draw = (scale: number) => {
		const width = source.width * scale;
		const height = source.height * scale;
		context.drawImage(
			source,
			(output.width - width) / 2,
			(output.height - height) / 2,
			width,
			height,
		);
	};
	const contain = Math.min(
		output.width / source.width,
		output.height / source.height,
	);
	const cover = Math.max(
		output.width / source.width,
		output.height / source.height,
	);
	if (cover > contain + 1e-6) {
		context.filter = "blur(24px)";
		draw(cover * 1.1);
		context.filter = "none";
	}
	draw(contain);
	return output;
}

/** Records the print resolution in the JPEG's JFIF header, if present. */
export async function withPrintDpi(blob: Blob) {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const jfif = [0xff, 0xd8, 0xff, 0xe0, -1, -1, 0x4a, 0x46, 0x49, 0x46, 0];
	if (!jfif.every((value, index) => value < 0 || bytes[index] === value))
		return blob;
	bytes[13] = 1; // density in dots per inch
	bytes[14] = bytes[16] = PRINT_DPI >> 8;
	bytes[15] = bytes[17] = PRINT_DPI & 0xff;
	return new Blob([bytes], { type: blob.type });
}
