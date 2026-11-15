import type { BoundingBox } from "@mediapipe/tasks-vision";

type FaceBox = Pick<BoundingBox, "originX" | "originY" | "width" | "height">;
type Track = { anchor: FaceBox; last: FaceBox; startedAt: number };

export const STILLNESS_SECONDS = 3;
const STILLNESS_MS = STILLNESS_SECONDS * 1_000;
const MAX_SAMPLE_GAP_MS = 750;
const MIN_OVERLAP = 0.4;
const MAX_POSITION_CHANGE = 0.08;
const MAX_SIZE_CHANGE = 0.1;

function overlap(a: FaceBox, b: FaceBox) {
	const width = Math.max(
		0,
		Math.min(a.originX + a.width, b.originX + b.width) -
			Math.max(a.originX, b.originX),
	);
	const height = Math.max(
		0,
		Math.min(a.originY + a.height, b.originY + b.height) -
			Math.max(a.originY, b.originY),
	);
	const intersection = width * height;
	return (
		intersection / (a.width * a.height + b.width * b.height - intersection)
	);
}

function isStill(anchor: FaceBox, face: FaceBox) {
	const x = face.originX + face.width / 2 - (anchor.originX + anchor.width / 2);
	const y =
		face.originY + face.height / 2 - (anchor.originY + anchor.height / 2);
	return (
		Math.abs(x) <= anchor.width * MAX_POSITION_CHANGE &&
		Math.abs(y) <= anchor.height * MAX_POSITION_CHANGE &&
		Math.abs(face.width / anchor.width - 1) <= MAX_SIZE_CHANGE &&
		Math.abs(face.height / anchor.height - 1) <= MAX_SIZE_CHANGE
	);
}

export function createFaceStillnessTracker() {
	let tracks: Track[] = [];
	let lastSample: number | null = null;

	function reset() {
		tracks = [];
		lastSample = null;
	}

	function update(faces: FaceBox[], now: number) {
		if (!Number.isFinite(now)) {
			reset();
			return false;
		}
		if (
			lastSample !== null &&
			(now <= lastSample || now - lastSample > MAX_SAMPLE_GAP_MS)
		)
			reset();
		lastSample = now;
		const validFaces = faces
			.filter(
				(face) =>
					[face.originX, face.originY, face.width, face.height].every(
						Number.isFinite,
					) &&
					face.width > 0 &&
					face.height > 0,
			)
			.map((face) => ({ ...face }));
		const matches = tracks.flatMap((track, trackIndex) =>
			validFaces.map((face, faceIndex) => ({
				trackIndex,
				faceIndex,
				overlap: overlap(track.last, face),
			})),
		);
		matches.sort((a, b) => b.overlap - a.overlap);
		const assignedTracks = new Set<number>();
		const assignedFaces = new Set<number>();
		const next: Track[] = [];
		for (const match of matches) {
			if (match.overlap < MIN_OVERLAP) break;
			if (
				assignedTracks.has(match.trackIndex) ||
				assignedFaces.has(match.faceIndex)
			)
				continue;
			assignedTracks.add(match.trackIndex);
			assignedFaces.add(match.faceIndex);
			const track = tracks[match.trackIndex];
			const face = validFaces[match.faceIndex];
			next.push(
				isStill(track.anchor, face)
					? { ...track, last: face }
					: { anchor: face, last: face, startedAt: now },
			);
		}
		validFaces.forEach((face, index) => {
			if (!assignedFaces.has(index))
				next.push({ anchor: face, last: face, startedAt: now });
		});
		tracks = next;
		return tracks.some((track) => now - track.startedAt >= STILLNESS_MS);
	}

	return { update, reset };
}
