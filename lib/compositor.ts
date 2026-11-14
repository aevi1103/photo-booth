import { BACKDROP_DIMENSION_ERROR, MAX_BACKDROP_PIXELS } from "@/lib/backdrops";
import {
	getFrameOpenings,
	MAX_FRAME_OPENINGS,
	type Opening,
} from "@/lib/frame-geometry";

type Settings = {
	color: string;
	threshold: number;
	softness: number;
	mirror: boolean;
	greenScreen: boolean;
};

const vertex = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `
precision mediump float;
varying vec2 uv;
uniform sampler2D camera;
uniform sampler2D background;
uniform sampler2D frameImage;
uniform sampler2D shot0;
uniform sampler2D shot1;
uniform sampler2D shot2;
uniform vec3 keyColor;
uniform float threshold;
uniform float softness;
uniform float mirror;
uniform float greenScreen;
uniform vec4 slotRects[3];
uniform vec2 slotScales[3];
// 0 = empty, 1 = live camera, 2 = frozen shot.
uniform float slotModes[3];
vec2 chroma(vec3 c) {
  c = c / max(c.r + c.g + c.b, 0.001);
  return vec2(c.b - c.g, c.r - c.g);
}
vec4 slot(sampler2D shot, vec4 rect, vec2 scale, float mode) {
  vec2 openingUv = (uv - rect.xy) / rect.zw;
  if (mode < 0.5 || openingUv.x < 0.0 || openingUv.x > 1.0 || openingUv.y < 0.0 || openingUv.y > 1.0) {
    return vec4(0.0);
  }
  vec2 cameraUv = (openingUv - 0.5) * scale + 0.5;
  cameraUv.x = mix(cameraUv.x, 1.0 - cameraUv.x, mirror);
  vec3 color = mode > 1.5 ? texture2D(shot, cameraUv).rgb : texture2D(camera, cameraUv).rgb;
  return vec4(color, 1.0);
}
void main() {
  vec3 backdrop = texture2D(background, uv).rgb;
  vec4 foreground = slot(shot0, slotRects[0], slotScales[0], slotModes[0]);
  if (foreground.a < 0.5) foreground = slot(shot1, slotRects[1], slotScales[1], slotModes[1]);
  if (foreground.a < 0.5) foreground = slot(shot2, slotRects[2], slotScales[2], slotModes[2]);
  vec3 video = backdrop;
  if (foreground.a > 0.5) {
    float distanceToKey = distance(chroma(foreground.rgb), chroma(keyColor));
    float alpha = mix(1.0, smoothstep(threshold, threshold + softness, distanceToKey), greenScreen);
    video = mix(backdrop, foreground.rgb, alpha);
  }
  vec4 frame = texture2D(frameImage, uv);
  gl_FragColor = vec4(mix(video, frame.rgb, frame.a), 1.0);
}`;

function compileShader(
	context: WebGLRenderingContext,
	type: number,
	source: string,
) {
	const result = context.createShader(type);
	if (!result) throw new Error("Could not create the video shader.");
	context.shaderSource(result, source);
	context.compileShader(result);
	if (!context.getShaderParameter(result, context.COMPILE_STATUS)) {
		throw new Error(`Video shader failed: ${context.getShaderInfoLog(result)}`);
	}
	return result;
}

function createProgram(context: WebGLRenderingContext) {
	const program = context.createProgram();
	if (!program) throw new Error("Could not create the video program.");
	context.attachShader(
		program,
		compileShader(context, context.VERTEX_SHADER, vertex),
	);
	context.attachShader(
		program,
		compileShader(context, context.FRAGMENT_SHADER, fragment),
	);
	context.linkProgram(program);
	if (!context.getProgramParameter(program, context.LINK_STATUS)) {
		throw new Error("Could not initialize the video program.");
	}
	const activateProgram = context.useProgram.bind(context);
	activateProgram(program);
	return program;
}

function createTexture(context: WebGLRenderingContext, unit: number) {
	const result = context.createTexture();
	if (!result) throw new Error("Could not create a video texture.");
	context.activeTexture(context.TEXTURE0 + unit);
	context.bindTexture(context.TEXTURE_2D, result);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_WRAP_S,
		context.CLAMP_TO_EDGE,
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_WRAP_T,
		context.CLAMP_TO_EDGE,
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_MIN_FILTER,
		context.LINEAR,
	);
	context.texParameteri(
		context.TEXTURE_2D,
		context.TEXTURE_MAG_FILTER,
		context.LINEAR,
	);
	return result;
}

export function createCompositor(canvas: HTMLCanvasElement) {
	const context = canvas.getContext("webgl", { preserveDrawingBuffer: true });
	if (!context)
		throw new Error(
			"WebGL is unavailable. Try a current browser with hardware acceleration enabled.",
		);
	const program = createProgram(context);
	const buffer = context.createBuffer();
	context.bindBuffer(context.ARRAY_BUFFER, buffer);
	context.bufferData(
		context.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
		context.STATIC_DRAW,
	);
	const position = context.getAttribLocation(program, "position");
	context.enableVertexAttribArray(position);
	context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

	const videoTexture = createTexture(context, 0);
	const backgroundTexture = createTexture(context, 1);
	const frameTexture = createTexture(context, 2);
	const shotTextures = Array.from(
		{ length: MAX_FRAME_OPENINGS },
		(_, index) => {
			const texture = createTexture(context, 3 + index);
			context.texImage2D(
				context.TEXTURE_2D,
				0,
				context.RGBA,
				1,
				1,
				0,
				context.RGBA,
				context.UNSIGNED_BYTE,
				new Uint8Array([0, 0, 0, 255]),
			);
			return texture;
		},
	);
	context.uniform1i(context.getUniformLocation(program, "camera"), 0);
	context.uniform1i(context.getUniformLocation(program, "background"), 1);
	context.uniform1i(context.getUniformLocation(program, "frameImage"), 2);
	shotTextures.forEach((_, index) => {
		context.uniform1i(
			context.getUniformLocation(program, `shot${index}`),
			3 + index,
		);
	});
	const slotRects = context.getUniformLocation(program, "slotRects");
	const slotScales = context.getUniformLocation(program, "slotScales");
	const slotModes = context.getUniformLocation(program, "slotModes");
	context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
	let frameWidth = 0;
	let frameHeight = 0;
	let openings: Opening[] = [];
	// Camera aspect ratio of each frozen shot; null while the box is not captured.
	let frozenAspects: (number | null)[] = [];
	let activeSlot: number | null = 0;
	context.activeTexture(context.TEXTURE1);
	context.bindTexture(context.TEXTURE_2D, backgroundTexture);
	context.texImage2D(
		context.TEXTURE_2D,
		0,
		context.RGBA,
		1,
		1,
		0,
		context.RGBA,
		context.UNSIGNED_BYTE,
		new Uint8Array([218, 237, 247, 255]),
	);
	context.activeTexture(context.TEXTURE2);
	context.bindTexture(context.TEXTURE_2D, frameTexture);
	context.texImage2D(
		context.TEXTURE_2D,
		0,
		context.RGBA,
		1,
		1,
		0,
		context.RGBA,
		context.UNSIGNED_BYTE,
		new Uint8Array([218, 237, 247, 255]),
	);

	return {
		setFrame(image: HTMLImageElement) {
			if (!image.naturalWidth || !image.naturalHeight)
				throw new Error("The photo frame has unexpected dimensions.");
			const maxTexture: number = context.getParameter(context.MAX_TEXTURE_SIZE);
			const maxRenderbuffer: number = context.getParameter(
				context.MAX_RENDERBUFFER_SIZE,
			);
			const maxViewport: Int32Array = context.getParameter(
				context.MAX_VIEWPORT_DIMS,
			);
			if (
				image.naturalWidth >
					Math.min(maxTexture, maxRenderbuffer, maxViewport[0]) ||
				image.naturalHeight >
					Math.min(maxTexture, maxRenderbuffer, maxViewport[1])
			)
				throw new Error(
					"That frame is too large for this device. Choose a smaller design.",
				);
			if (image.naturalWidth * image.naturalHeight > MAX_BACKDROP_PIXELS)
				throw new Error(BACKDROP_DIMENSION_ERROR);
			const frameOpenings = getFrameOpenings(image);
			context.activeTexture(context.TEXTURE2);
			context.bindTexture(context.TEXTURE_2D, frameTexture);
			context.texImage2D(
				context.TEXTURE_2D,
				0,
				context.RGBA,
				context.RGBA,
				context.UNSIGNED_BYTE,
				image,
			);
			if (context.getError() !== context.NO_ERROR)
				throw new Error("Could not load the photo frame into the preview.");
			frameWidth = image.naturalWidth;
			frameHeight = image.naturalHeight;
			canvas.width = frameWidth;
			canvas.height = frameHeight;
			if (
				context.drawingBufferWidth !== frameWidth ||
				context.drawingBufferHeight !== frameHeight
			)
				throw new Error(
					"Could not render that frame at its original size. Choose a smaller design.",
				);
			openings = frameOpenings;
			frozenAspects = openings.map(() => null);
			activeSlot = 0;
			const rects = new Float32Array(MAX_FRAME_OPENINGS * 4);
			openings.forEach((opening, index) => {
				rects.set(
					[
						opening.x,
						1 - opening.y - opening.height,
						opening.width,
						opening.height,
					],
					index * 4,
				);
			});
			context.uniform4fv(slotRects, rects);
			return { width: frameWidth, height: frameHeight, openings };
		},
		/** Shows the live camera in one box (or none); captured boxes stay frozen. */
		setActiveSlot(index: number | null) {
			activeSlot = index;
		},
		/** Freezes the current camera frame into a box. */
		freezeSlot(index: number, video: HTMLVideoElement) {
			if (index < 0 || index >= openings.length)
				throw new Error("That photo box is not in the frame.");
			if (!video.videoWidth || !video.videoHeight)
				throw new Error("The camera is not ready yet.");
			context.activeTexture(context.TEXTURE3 + index);
			context.bindTexture(context.TEXTURE_2D, shotTextures[index]);
			context.texImage2D(
				context.TEXTURE_2D,
				0,
				context.RGBA,
				context.RGBA,
				context.UNSIGNED_BYTE,
				video,
			);
			if (context.getError() !== context.NO_ERROR)
				throw new Error("Could not capture the photo.");
			frozenAspects[index] = video.videoWidth / video.videoHeight;
			if (activeSlot === index) activeSlot = null;
		},
		/** Clears every captured box and shows the camera in the first one. */
		resetSlots() {
			frozenAspects = openings.map(() => null);
			activeSlot = 0;
		},
		draw(video: HTMLVideoElement, settings: Settings) {
			if (
				!frameWidth ||
				!frameHeight ||
				!video.videoWidth ||
				!video.videoHeight
			)
				return;
			context.viewport(0, 0, canvas.width, canvas.height);
			context.activeTexture(context.TEXTURE0);
			context.bindTexture(context.TEXTURE_2D, videoTexture);
			context.texImage2D(
				context.TEXTURE_2D,
				0,
				context.RGBA,
				context.RGBA,
				context.UNSIGNED_BYTE,
				video,
			);
			const color = settings.color.match(/[a-f\d]{2}/gi);
			if (color?.length !== 3) throw new Error("Invalid key color.");
			context.uniform3f(
				context.getUniformLocation(program, "keyColor"),
				...(color.map((part) => parseInt(part, 16) / 255) as [
					number,
					number,
					number,
				]),
			);
			context.uniform1f(
				context.getUniformLocation(program, "threshold"),
				settings.threshold,
			);
			context.uniform1f(
				context.getUniformLocation(program, "softness"),
				settings.softness,
			);
			context.uniform1f(
				context.getUniformLocation(program, "mirror"),
				settings.mirror ? 1 : 0,
			);
			context.uniform1f(
				context.getUniformLocation(program, "greenScreen"),
				settings.greenScreen ? 1 : 0,
			);
			const cameraAspect = video.videoWidth / video.videoHeight;
			const scales = new Float32Array(MAX_FRAME_OPENINGS * 2);
			const modes = new Float32Array(MAX_FRAME_OPENINGS);
			openings.forEach((opening, index) => {
				const openingAspect =
					(frameWidth * opening.width) / (frameHeight * opening.height);
				const frozen = frozenAspects[index] ?? null;
				const aspect = frozen ?? cameraAspect;
				scales[index * 2] = Math.min(1, openingAspect / aspect);
				scales[index * 2 + 1] = Math.min(1, aspect / openingAspect);
				modes[index] = frozen !== null ? 2 : index === activeSlot ? 1 : 0;
			});
			context.uniform2fv(slotScales, scales);
			context.uniform1fv(slotModes, modes);
			context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
		},
		destroy() {
			context.deleteTexture(videoTexture);
			context.deleteTexture(backgroundTexture);
			context.deleteTexture(frameTexture);
			for (const texture of shotTextures) context.deleteTexture(texture);
			context.deleteBuffer(buffer);
			context.deleteProgram(program);
		},
	};
}
