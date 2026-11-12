import { readdir } from "node:fs/promises";
import path from "node:path";
import { Booth } from "@/components/booth";

async function getBackgrounds() {
	"use cache";
	// Bundled frame overlays; the camera shows through their transparent areas.
	const entries = await readdir(path.join(process.cwd(), "public", "frames"), {
		withFileTypes: true,
	});
	return entries
		.filter((entry) => entry.isFile() && /\.(png|webp)$/i.test(entry.name))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((entry) => ({
			name: entry.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
			url: `/frames/${encodeURIComponent(entry.name)}`,
		}));
}

export default async function Home() {
	return <Booth backgrounds={await getBackgrounds()} />;
}
