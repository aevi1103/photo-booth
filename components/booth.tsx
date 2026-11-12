"use client";

import { Cloud, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useBoothController } from "@/components/booth/hooks/use-booth-controller";
import { BoothPreview } from "@/components/booth/preview";
import { BoothSettings } from "@/components/booth/settings";
import type { Backdrop } from "@/components/booth/store/store";
import { SignOut } from "@/components/sign-out";
import { Button, buttonVariants } from "@/components/ui/button";
import { useBackdrops } from "@/lib/queries/backdrops";

export function Booth({ backgrounds: defaults }: { backgrounds: Backdrop[] }) {
	const backdrops = useBackdrops();
	const uploaded = backdrops.data;
	const backgrounds = useMemo(() => {
		const seen = new Set<string>();
		return [...defaults, ...(uploaded ?? [])].filter((item) => {
			if (seen.has(item.url)) return false;
			seen.add(item.url);
			return true;
		});
	}, [uploaded, defaults]);
	const {
		store,
		sounds,
		voice,
		videoRef,
		canvasRef,
		quota,
		canCapture,
		startCountdown,
		connect,
		upload,
		uploadView,
		retake,
		prepareSound,
	} = useBoothController(backgrounds);

	useEffect(() => {
		const { background, backgroundChosen } = store.getState();
		const adminDefault = backgrounds.find((item) => item.isDefault);
		if (!backgrounds.some((item) => item.url === background))
			store.setState({
				background: adminDefault?.url ?? backgrounds[0]?.url ?? "",
				backgroundChosen: false,
			});
		else if (!backgroundChosen && adminDefault)
			store.setState({ background: adminDefault.url });
	}, [backgrounds, store]);

	return (
		<main className="booth-shell capture-shell">
			<header className="topbar">
				<div className="brand">
					<Cloud size={26} /> little cloud <span>PHOTO BOOTH</span>
				</div>
				<div className="account-navigation">
					{quota.data?.role === "admin" && (
						<Link
							href="/admin/backdrops"
							className={buttonVariants({
								variant: "outline",
								className: "booth-navigation",
							})}
						>
							Manage backdrops
						</Link>
					)}
					<Link
						href="/gallery"
						className={buttonVariants({
							variant: "outline",
							className: "booth-navigation",
						})}
					>
						View gallery
					</Link>
					<SignOut />
				</div>
			</header>
			<section className="hero">
				<span className="eyebrow">
					<Sparkles size={15} /> A LITTLE ONE IS ON THE WAY
				</span>
				<h1>Welcome to the baby shower!</h1>
				<p>Strike a pose, pick a backdrop, and make a little memory.</p>
			</section>
			<div className="quota-status" aria-live="polite">
				{quota.data ? (
					<p>
						{quota.data.role === "admin"
							? "Admin account · Unlimited photo uploads"
							: `${quota.data.remaining} of 20 photo uploads remaining`}
						{quota.isRefetchError && " (last known)"}
						{quota.isFetching && (
							<span className="small" aria-hidden="true">
								{" "}
								· updating…
							</span>
						)}
					</p>
				) : (
					quota.isPending && <p>Loading your upload allowance...</p>
				)}
				{quota.data?.remaining === 0 && (
					<p>
						You have reached your total of 20 photos. You can still view your
						memories in the gallery.
					</p>
				)}
				{quota.isError && (
					<>
						<p className="notice" role="alert">
							{quota.error.message}
						</p>
						<Button
							variant="outline"
							disabled={quota.isFetching}
							onClick={() => void quota.refetch()}
						>
							Retry allowance
						</Button>
					</>
				)}
			</div>
			<div className="booth-grid">
				<BoothPreview
					store={store}
					backgrounds={backgrounds}
					backdropError={
						backdrops.isError ? backdrops.error.message : undefined
					}
					onRetryBackdrops={() => void backdrops.refetch()}
					videoRef={videoRef}
					canvasRef={canvasRef}
					sounds={sounds}
					voice={voice}
					onCapture={startCountdown}
					onRetake={retake}
					onUpload={upload}
					upload={uploadView}
					canCapture={canCapture}
					onPrepareSound={prepareSound}
				/>
				<BoothSettings
					store={store}
					onConnect={(deviceId) => void connect(deviceId)}
				/>
			</div>
			<footer>
				Made for little moments &amp; big memories <Cloud size={14} />
			</footer>
		</main>
	);
}
