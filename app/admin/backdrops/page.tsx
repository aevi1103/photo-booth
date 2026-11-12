import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackdropManager } from "@/components/backdrop-manager";
import { requireAdmin } from "@/lib/auth";

async function AdminBackdrops() {
	await connection();
	const auth = await requireAdmin();
	if (auth.response) {
		if (auth.response.status === 401) redirect("/login");
		if (auth.response.status === 403) redirect("/");
		throw new Error("Could not verify admin access. Please retry.");
	}
	return <BackdropManager />;
}

export default function BackdropsPage() {
	return (
		<Suspense fallback={<p role="status">Checking admin access...</p>}>
			<AdminBackdrops />
		</Suspense>
	);
}
