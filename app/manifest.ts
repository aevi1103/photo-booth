import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Little Cloud Photo Booth",
		short_name: "Little Cloud",
		description: "A photo booth for a special baby shower.",
		start_url: "/",
		display: "standalone",
		background_color: "#f5faff",
		theme_color: "#568eae",
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
		],
	};
}
