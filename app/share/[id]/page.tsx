import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { sharedPhotoExists } from "@/features/share/server";
import { appOrigin } from "@/lib/app-origin";

type Props = { params: Promise<{ id: string }> };
const title = "Nugget Photo Booth memory";

// Expiring public links may block to resolve their image or 404 metadata.
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	if (!(await sharedPhotoExists(id))) notFound();
	const requestHeaders = await headers();
	const host = requestHeaders.get("host");
	if (!host) throw new Error("The sharing origin could not be determined.");
	const origin = appOrigin(
		new Request(`http://${host}`, { headers: requestHeaders }),
	);
	const pageUrl = new URL(`/share/${id}`, origin).href;
	const imageUrl = `${pageUrl}/image`;
	return {
		title,
		description: "A photo booth memory shared with you.",
		robots: { index: false, follow: false },
		referrer: "no-referrer",
		openGraph: {
			type: "website",
			title,
			url: pageUrl,
			images: [{ url: imageUrl, alt: title }],
		},
		twitter: {
			card: "summary_large_image",
			title,
			images: [imageUrl],
		},
	};
}

async function SharedPhoto({ params }: Props) {
	const { id } = await params;
	if (!(await sharedPhotoExists(id))) notFound();
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center justify-center gap-4 p-4">
			<h1 className="text-center text-2xl font-semibold">{title}</h1>
			<Image
				src={`/share/${id}/image`}
				alt={title}
				width={1536}
				height={1024}
				unoptimized
				referrerPolicy="no-referrer"
				className="max-h-[80dvh] w-full rounded-xl object-contain"
			/>
			<p className="text-center text-sm text-muted-foreground">
				This shared link is available for seven days from when it was created.
			</p>
		</main>
	);
}

export default function SharePage(props: Props) {
	return (
		<Suspense fallback={<p role="status">Loading shared photo...</p>}>
			<SharedPhoto {...props} />
		</Suspense>
	);
}
