"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { SignOut } from "@/components/sign-out";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	useManagedBackdrops,
	useUpdateBackdrop,
	useUploadBackdrop,
} from "@/lib/queries/backdrops";

export function BackdropManager() {
	const backdrops = useManagedBackdrops();
	const upload = useUploadBackdrop();
	const update = useUpdateBackdrop();
	const form = useRef<HTMLFormElement>(null);
	return (
		<main className="booth-shell">
			<header className="topbar">
				<Link href="/" className="brand">
					little cloud
				</Link>
				<div className="account-navigation">
					<Link href="/" className={buttonVariants({ variant: "outline" })}>
						Back to booth
					</Link>
					<SignOut />
				</div>
			</header>
			<section className="hero">
				<h1>Manage backdrops</h1>
				<p>
					Upload frame designs for everyone to use in the photo booth. The
					camera video shows through the transparent parts of the image, so use
					a PNG or WebP with a transparent window (around 1153 × 768 pixels
					works best). JPEGs with a gray-and-white checkerboard window are
					converted during upload so the window becomes truly transparent.
				</p>
			</section>
			<div className="admin-content">
				<form
					className="admin-panel backdrop-upload"
					ref={form}
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						const file = data.get("file");
						if (!(file instanceof File)) return;
						upload.mutate(
							{ file, name: String(data.get("name")) },
							{ onSuccess: () => form.current?.reset() },
						);
					}}
				>
					<h2>Upload a backdrop</h2>
					<label htmlFor="backdrop-name">Backdrop name</label>
					<input
						id="backdrop-name"
						name="name"
						required
						maxLength={80}
						disabled={upload.isPending}
					/>
					<label htmlFor="backdrop-file">
						Image (JPEG, PNG, or WebP; up to 4 MiB)
					</label>
					<input
						id="backdrop-file"
						name="file"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						required
						disabled={upload.isPending}
					/>
					<Button type="submit" disabled={upload.isPending}>
						{upload.isPending ? "Uploading..." : "Upload backdrop"}
					</Button>
					{upload.isError && (
						<p className="notice" role="alert">
							{upload.error.message}
						</p>
					)}
					{upload.isSuccess && <p role="status">Backdrop uploaded.</p>}
				</form>
				<section className="admin-panel">
					<h2>Uploaded backdrops</h2>
					<p className="small">
						Hidden backdrops stay out of the booth carousel. The booth default
						is pre-selected for guests; without one, the first built-in design
						is used.
					</p>
					{backdrops.isPending && <p role="status">Loading backdrops...</p>}
					{backdrops.isError && (
						<>
							<p className="notice" role="alert">
								{backdrops.error.message}
							</p>
							<Button
								variant="outline"
								onClick={() => void backdrops.refetch()}
							>
								Retry backdrops
							</Button>
						</>
					)}
					{backdrops.data?.length === 0 && (
						<p>
							No uploaded backdrops yet. The booth uses its default backdrops.
						</p>
					)}
					{update.isError && (
						<p className="notice" role="alert">
							{update.error.message}
						</p>
					)}
					<div className="backdrop-gallery">
						{backdrops.data?.map((item) => (
							<figure key={item.file}>
								<Image
									src={item.url}
									alt={item.name}
									width={320}
									height={180}
									unoptimized
								/>
								<figcaption>
									{item.name}
									{item.isDefault && <strong> · Booth default</strong>}
									{item.hidden && <em> · Hidden</em>}
								</figcaption>
								<div className="backdrop-actions">
									<Button
										variant="outline"
										disabled={update.isPending}
										onClick={() =>
											update.mutate({ file: item.file, hidden: !item.hidden })
										}
									>
										{item.hidden ? "Show in booth" : "Hide from booth"}
									</Button>
									{item.isDefault ? (
										<Button
											variant="outline"
											disabled={update.isPending}
											onClick={() =>
												update.mutate({ file: item.file, isDefault: false })
											}
										>
											Use built-in default
										</Button>
									) : (
										<Button
											variant="outline"
											disabled={update.isPending || item.hidden}
											onClick={() =>
												update.mutate({ file: item.file, isDefault: true })
											}
										>
											Make booth default
										</Button>
									)}
								</div>
							</figure>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
