"use client";

import { Cloud, Sparkles } from "lucide-react";
import Link from "next/link";
import { useBoothController } from "@/components/booth/hooks/use-booth-controller";
import { BoothPreview } from "@/components/booth/preview";
import { BoothSettings } from "@/components/booth/settings";
import type { Backdrop } from "@/components/booth/store/store";
import { SignOut } from "@/components/sign-out";
import { Button, buttonVariants } from "@/components/ui/button";

export function Booth({ backgrounds }: { backgrounds: Backdrop[] }) {
	const {
		store,
		sounds,
		voice,
		videoRef,
		canvasRef,
		quota,
		quotaError,
		refreshQuota,
		startCountdown,
		connect,
		upload,
		retake,
		prepareSound,
	} = useBoothController(backgrounds);

	return (
		<main className="booth-shell capture-shell">
			<header className="topbar">
				<div className="brand">
					<Cloud size={26} /> little cloud <span>PHOTO BOOTH</span>
				</div>
				<div className="account-navigation">
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
				{quota ? (
					<p>
						{quota.role === "admin"
							? "Admin account · Unlimited photo uploads"
							: `${quota.remaining} of 20 photo uploads remaining`}
					</p>
				) : (
					!quotaError && <p>Loading your upload allowance...</p>
				)}
				{quota?.remaining === 0 && (
					<p>
						You have reached your total of 20 photos. You can still view your
						memories in the gallery.
					</p>
				)}
				{quotaError && (
					<>
						<p className="notice" role="alert">
							{quotaError}
						</p>
						<Button variant="outline" onClick={() => void refreshQuota()}>
							Retry allowance
						</Button>
					</>
				)}
			</div>
			<div className="booth-grid">
				<BoothPreview
					store={store}
					videoRef={videoRef}
					canvasRef={canvasRef}
					sounds={sounds}
					voice={voice}
					onCapture={startCountdown}
					onRetake={retake}
					onUpload={upload}
					onPrepareSound={prepareSound}
				/>
				<BoothSettings
					store={store}
					backgrounds={backgrounds}
					onConnect={(deviceId) => void connect(deviceId)}
				/>
			</div>
			<footer>
				Made for little moments &amp; big memories <Cloud size={14} />
			</footer>
		</main>
	);
}
