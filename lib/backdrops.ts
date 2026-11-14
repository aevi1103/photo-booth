export type Backdrop = { name: string; url: string; isDefault?: boolean };
export type ManagedBackdrop = {
	file: string;
	name: string;
	url: string;
	hidden: boolean;
	isDefault: boolean;
};

export const MAX_BACKDROP_BYTES = 4 * 1024 * 1024;
export const MAX_BACKDROP_PIXELS = 8 * 1024 * 1024;
export const BACKDROP_SIZE_ERROR = "Backdrops must be 4 MiB or smaller.";
export const BACKDROP_DIMENSION_ERROR = "Backdrops must be 8 megapixels or smaller.";
export const backdropTypes = ["image/jpeg", "image/png", "image/webp"];

export function isBackdropImage(image: Uint8Array, type: string) {
	if (type === "image/jpeg")
		return (
			image.length >= 4 &&
			image[0] === 0xff &&
			image[1] === 0xd8 &&
			image[2] === 0xff &&
			image.at(-2) === 0xff &&
			image.at(-1) === 0xd9
		);
	if (type === "image/png")
		return (
			image.length >= 24 &&
			[137, 80, 78, 71, 13, 10, 26, 10].every(
				(byte, index) => image[index] === byte,
			)
		);
	if (type === "image/webp")
		return (
			image.length >= 16 &&
			String.fromCharCode(...image.slice(0, 4)) === "RIFF" &&
			String.fromCharCode(...image.slice(8, 12)) === "WEBP"
		);
	return false;
}
