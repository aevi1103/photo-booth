import { Booth } from "@/components/booth";
import { readdir } from "node:fs/promises";
import path from "node:path";

async function getBackgrounds() {
  "use cache";
  const entries = await readdir(path.join(process.cwd(), "public", "images"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      url: `/images/${encodeURIComponent(entry.name)}`,
    }));
}

export default async function Home() {
  return <Booth backgrounds={await getBackgrounds()} />;
}
