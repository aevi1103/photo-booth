import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const target = join(process.cwd(), "public", "mediapipe", "wasm");
await mkdir(target, { recursive: true });
for (const name of [
	"vision_wasm_internal.js",
	"vision_wasm_internal.wasm",
	"vision_wasm_module_internal.js",
	"vision_wasm_module_internal.wasm",
]) {
	await copyFile(
		require.resolve(`@mediapipe/tasks-vision/${name}`),
		join(target, name),
	);
}
