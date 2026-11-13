"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { SignOut } from "@/components/sign-out";
import { Button } from "@/components/ui/button";
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
		<main className="mx-auto w-full max-w-360 px-[6%]">
			<header className="topbar sticky top-0 z-30 flex h-20.5 items-center justify-between border-b border-[#e1edf4] bg-[linear-gradient(90deg,#f5faff00,#f5faffeb_18%,#f5faffeb_82%,#f5faff00)] backdrop-blur-[12px] [@media(max-width:480px)]:h-auto [@media(max-width:480px)]:min-h-[82px] [@media(max-width:480px)]:flex-wrap [@media(max-width:480px)]:gap-3 [@media(max-width:480px)]:py-3.5">
				<Link
					href="/"
					className="flex items-center gap-2 text-[22px] font-bold text-[#558eae] no-underline [@media(max-width:480px)]:text-[19px]"
				>
					little cloud
				</Link>
				<div className="flex items-center gap-2">
					<Link href="/">
						<Button variant="outline">Back to booth</Button>
					</Link>
					<SignOut />
				</div>
			</header>
			<section className="px-3 pt-12.5 pb-8.75 text-center [@media(max-width:800px)]:pt-8">
				<h1 className="mt-3.5 mb-2.25 font-[Georgia,serif] text-[clamp(32px,4vw,48px)] font-normal text-[#345d76]">
					Manage backdrops
				</h1>
				<p className="text-[14px] text-[#89a1af]">
					Upload frame designs for everyone to use in the photo booth. The
					camera video shows through the transparent parts of the image, so use
					a PNG or WebP with a transparent window (around 1153 × 768 pixels
					works best). JPEGs with a gray-and-white checkerboard window are
					converted during upload so the window becomes truly transparent.
				</p>
			</section>
			<div className="mx-auto max-w-275">
				<form
					className="mb-4.5 grid gap-3.5 rounded-[18px] border border-[#e6f0f5] bg-white p-6 shadow-[0_10px_35px_#8daec314]"
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
					<h2 className="text-[16px] font-bold text-[#365e74]">
						Upload a backdrop
					</h2>
					<label htmlFor="backdrop-name">Backdrop name</label>
					<input
						id="backdrop-name"
						className="w-full rounded-lg border border-[#dcebf2] bg-[#fbfdff] p-2.5 text-[13px] text-[#416a80]"
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
						<p
							className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
							role="alert"
						>
							{upload.error.message}
						</p>
					)}
					{upload.isSuccess && <p role="status">Backdrop uploaded.</p>}
				</form>
				<section className="mb-[18px] rounded-[18px] border border-[#e6f0f5] bg-white p-6 shadow-[0_10px_35px_#8daec314]">
					<h2 className="text-[16px] font-bold text-[#365e74]">
						Uploaded backdrops
					</h2>
					<p className="text-[14px] leading-[1.5] text-[#89a1af]">
						Hidden backdrops stay out of the booth carousel. The booth default
						is pre-selected for guests; without one, the first built-in design
						is used.
					</p>
					{backdrops.isPending && <p role="status">Loading backdrops...</p>}
					{backdrops.isError && (
						<>
							<p
								className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
								role="alert"
							>
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
						<p
							className="mt-3.5 rounded-[9px] bg-[#fff1ed] p-[11px] text-[13px] text-[#934b43]"
							role="alert"
						>
							{update.error.message}
						</p>
					)}
					<div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
						{backdrops.data?.map((item) => (
							<figure key={item.file}>
								<Image
									className="aspect-video w-full rounded-lg object-cover"
									src={item.url}
									alt={item.name}
									width={320}
									height={180}
									unoptimized
								/>
								<figcaption className="my-1.5 text-[13px]">
									{item.name}
									{item.isDefault && <strong> · Booth default</strong>}
									{item.hidden && <em> · Hidden</em>}
								</figcaption>
								<div className="flex flex-wrap gap-2">
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
