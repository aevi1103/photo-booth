import { getFrameOpening } from "@/lib/frame-geometry";

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
uniform vec3 keyColor;
uniform float threshold;
uniform float softness;
uniform float mirror;
uniform float greenScreen;
uniform vec2 cameraScale;
uniform vec4 cameraRect;
vec2 chroma(vec3 c) {
  c = c / max(c.r + c.g + c.b, 0.001);
  return vec2(c.b - c.g, c.r - c.g);
}
void main() {
  vec2 openingUv = (uv - cameraRect.xy) / cameraRect.zw;
  vec2 cameraUv = (openingUv - 0.5) * cameraScale + 0.5;
  cameraUv.x = mix(cameraUv.x, 1.0 - cameraUv.x, mirror);
  vec3 foreground = texture2D(camera, cameraUv).rgb;
  vec3 backdrop = texture2D(background, uv).rgb;
  float distanceToKey = distance(chroma(foreground), chroma(keyColor));
  float alpha = mix(1.0, smoothstep(threshold, threshold + softness, distanceToKey), greenScreen);
  vec3 video = mix(backdrop, foreground, alpha);
  if (openingUv.x < 0.0 || openingUv.x > 1.0 || openingUv.y < 0.0 || openingUv.y > 1.0) {
    video = backdrop;
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
	context.uniform1i(context.getUniformLocation(program, "camera"), 0);
	context.uniform1i(context.getUniformLocation(program, "background"), 1);
	context.uniform1i(context.getUniformLocation(program, "frameImage"), 2);
	context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
	let frameWidth = 0;
	let frameHeight = 0;
	let openingAspect = 1;
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
			const opening = getFrameOpening(image);
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
			openingAspect =
				(frameWidth * opening.width) / (frameHeight * opening.height);
			context.uniform4f(
				context.getUniformLocation(program, "cameraRect"),
				opening.x,
				1 - opening.y - opening.height,
				opening.width,
				opening.height,
			);
			return { width: frameWidth, height: frameHeight };
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
			context.uniform2f(
				context.getUniformLocation(program, "cameraScale"),
				Math.min(1, openingAspect / cameraAspect),
				Math.min(1, cameraAspect / openingAspect),
			);
			context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
		},
		destroy() {
			context.deleteTexture(videoTexture);
			context.deleteTexture(backgroundTexture);
			context.deleteTexture(frameTexture);
			context.deleteBuffer(buffer);
			context.deleteProgram(program);
		},
	};
}
