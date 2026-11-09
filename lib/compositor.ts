type Settings = { color: string; threshold: number; softness: number; mirror: boolean };

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
uniform vec3 keyColor;
uniform float threshold;
uniform float softness;
uniform float mirror;
uniform vec2 backgroundScale;
vec2 chroma(vec3 c) {
  c = c / max(c.r + c.g + c.b, 0.001);
  return vec2(c.b - c.g, c.r - c.g);
}
void main() {
  vec2 cameraUv = vec2(mix(uv.x, 1.0 - uv.x, mirror), uv.y);
  vec3 foreground = texture2D(camera, cameraUv).rgb;
  vec3 backdrop = texture2D(background, (uv - 0.5) * backgroundScale + 0.5).rgb;
  float distanceToKey = distance(chroma(foreground), chroma(keyColor));
  float alpha = smoothstep(threshold, threshold + softness, distanceToKey);
  gl_FragColor = vec4(mix(backdrop, foreground, alpha), 1.0);
}`;

export function createCompositor(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL is unavailable. Try a current browser with hardware acceleration enabled.");
  const context = gl;
  function shader(type: number, source: string) {
    const result = context.createShader(type);
    if (!result) throw new Error("Could not create the video shader.");
    context.shaderSource(result, source);
    context.compileShader(result);
    if (!context.getShaderParameter(result, context.COMPILE_STATUS)) {
      throw new Error(`Video shader failed: ${context.getShaderInfoLog(result)}`);
    }
    return result;
  }
  const program = context.createProgram();
  if (!program) throw new Error("Could not create the video program.");
  context.attachShader(program, shader(context.VERTEX_SHADER, vertex));
  context.attachShader(program, shader(context.FRAGMENT_SHADER, fragment));
  context.linkProgram(program);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) throw new Error("Could not initialize the video program.");
  context.useProgram(program);
  const buffer = context.createBuffer();
  context.bindBuffer(context.ARRAY_BUFFER, buffer);
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), context.STATIC_DRAW);
  const position = context.getAttribLocation(program, "position");
  context.enableVertexAttribArray(position);
  context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

  function texture(unit: number) {
    const result = context.createTexture();
    if (!result) throw new Error("Could not create a video texture.");
    context.activeTexture(context.TEXTURE0 + unit);
    context.bindTexture(context.TEXTURE_2D, result);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    return result;
  }
  const videoTexture = texture(0);
  const backgroundTexture = texture(1);
  context.uniform1i(context.getUniformLocation(program, "camera"), 0);
  context.uniform1i(context.getUniformLocation(program, "background"), 1);
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
  let backgroundWidth = 1;
  let backgroundHeight = 1;
  context.activeTexture(context.TEXTURE1);
  context.bindTexture(context.TEXTURE_2D, backgroundTexture);
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, new Uint8Array([218, 237, 247, 255]));

  return {
    setBackground(image: HTMLImageElement) {
      backgroundWidth = image.naturalWidth;
      backgroundHeight = image.naturalHeight;
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, backgroundTexture);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, image);
    },
    draw(video: HTMLVideoElement, settings: Settings) {
      if (!video.videoWidth || !video.videoHeight) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      context.viewport(0, 0, canvas.width, canvas.height);
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, videoTexture);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, video);
      const color = settings.color.match(/[a-f\d]{2}/gi);
      if (!color || color.length !== 3) throw new Error("Invalid key color.");
      context.uniform3f(context.getUniformLocation(program, "keyColor"), ...color.map((part) => parseInt(part, 16) / 255) as [number, number, number]);
      context.uniform1f(context.getUniformLocation(program, "threshold"), settings.threshold);
      context.uniform1f(context.getUniformLocation(program, "softness"), settings.softness);
      context.uniform1f(context.getUniformLocation(program, "mirror"), settings.mirror ? 1 : 0);
      const outputAspect = canvas.width / canvas.height;
      const backgroundAspect = backgroundWidth / backgroundHeight;
      context.uniform2f(context.getUniformLocation(program, "backgroundScale"),
        Math.min(1, outputAspect / backgroundAspect), Math.min(1, backgroundAspect / outputAspect));
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      context.deleteTexture(videoTexture);
      context.deleteTexture(backgroundTexture);
      context.deleteBuffer(buffer);
      context.deleteProgram(program);
    },
  };
}
