"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Cloud, Download, Mic, MicOff, RefreshCw, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { createCompositor } from "@/lib/compositor";
import { useVoiceTrigger } from "@/lib/use-voice-trigger";
import { SignOut } from "@/components/sign-out";
import { isPhotoQuota, type PhotoQuota } from "@/lib/photo-quota";
import { MAX_PHOTO_BYTES, PHOTO_SIZE_ERROR } from "@/lib/photo-limits";
import { useBoothSounds } from "@/lib/use-booth-sounds";

type Compositor = ReturnType<typeof createCompositor>;
type Photo = { url: string; blob: Blob };
const initialSettings = { color: "#00a000", threshold: 0.25, softness: 0.20, mirror: false, greenScreen: false };
type Backdrop = { name: string; url: string };

export function Booth({ backgrounds }: { backgrounds: Backdrop[] }) {
  const router = useRouter();
  const sounds = useBoothSounds();
  const { prepare: prepareSound, cancel: cancelSound } = sounds;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef(initialSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [background, setBackground] = useState(backgrounds[0]?.url ?? "");
  const [frameReady, setFrameReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [resolution, setResolution] = useState("");
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploadState, setUploadState] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [quota, setQuota] = useState<PhotoQuota | null>(null);
  const [quotaError, setQuotaError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureBusyRef = useRef(false);
  const connectingRef = useRef(false);
  const connectionRef = useRef(0);

  const refreshQuota = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (response.status === 401) { router.replace("/login"); return; }
      const result = await response.json();
      if (!response.ok || !isPhotoQuota(result.quota)) throw new Error(result.error ?? "Could not load your upload allowance.");
      setQuota(result.quota);
      setQuotaError("");
    } catch (error) {
      setQuotaError(error instanceof Error ? error.message : "Could not load your upload allowance.");
      setQuota(null);
    }
  }, [router]);

  useEffect(() => {
    void refreshQuota();
    const refresh = () => { void refreshQuota(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refreshQuota]);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let compositor: Compositor;
    try { compositor = createCompositor(canvas); }
    catch (error) { queueMicrotask(() => setMessage(error instanceof Error ? error.message : "Could not start the preview.")); return; }
    compositorRef.current = compositor;
    const frameImage = new Image();
    frameImage.onload = () => {
      try { compositor.setFrame(frameImage); setFrameReady(true); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the photo frame."); }
    };
    frameImage.onerror = () => setMessage("Could not load the photo frame. Refresh the page and try again.");
    frameImage.src = "/frames/baby-shower.png";
    let animation = 0;
    const render = () => {
      try {
        if (video.readyState >= 2) compositor.draw(video, settingsRef.current);
        animation = requestAnimationFrame(render);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not render the camera preview.");
      }
    };
    animation = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animation);
      connectionRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearTimeout(timerRef.current);
      frameImage.onload = null;
      frameImage.onerror = null;
      compositor.destroy();
      compositorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!background) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      try { compositorRef.current?.setBackground(image); }
      catch { setMessage("Could not use that background. Check its storage access and try another image."); }
    };
    image.onerror = () => { if (!cancelled) setMessage("Could not load that background image."); };
    image.src = background;
    return () => { cancelled = true; };
  }, [background]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const connect = useCallback(async (selected: string) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    void prepareSound();
    const connection = ++connectionRef.current;
    setConnecting(true);
    setMessage("");
    setConnected(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const facing = selected === "facing:user" ? "user" : selected === "facing:environment" ? "environment" : null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(facing ? { facingMode: { exact: facing } } : selected ? { deviceId: { exact: selected } } : {}),
          width: { ideal: 1920 }, height: { ideal: 1080 },
        },
      });
      if (connection !== connectionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("The selected camera did not provide a video track.");
      const interrupted = () => {
        if (streamRef.current !== stream) return;
        cancelSound();
        if (timerRef.current) clearTimeout(timerRef.current);
        setCountdown(null);
        captureBusyRef.current = false;
        setConnected(false);
        setMessage("Camera paused or disconnected. Return to this page and press Connect to resume.");
      };
      track.onended = interrupted;
      track.onmute = interrupted;
      track.onunmute = () => {
        if (streamRef.current !== stream || track.readyState !== "live") return;
        setConnected(true);
        setMessage("");
      };
      if (!videoRef.current) { stream.getTracks().forEach((item) => item.stop()); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (connection !== connectionRef.current) { stream.getTracks().forEach((item) => item.stop()); return; }
      compositorRef.current?.draw(videoRef.current, settingsRef.current);
      const info = track.getSettings();
      setResolution(info.width && info.height ? `${info.width} × ${info.height}` : "Resolution unavailable");
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput"));
      setDeviceId(facing ? selected : info.deviceId ?? selected);
      setConnected(true);
    } catch (error) {
      if (connection !== connectionRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const name = error instanceof Error ? error.name : "";
      const explanation = name === "NotAllowedError" ? "Allow camera access in your browser settings, then press Connect. Open this page directly in Safari or Chrome rather than an in-app browser."
        : name === "NotFoundError" || name === "OverconstrainedError" ? "That camera is unavailable. Try Default camera or another camera. External Cam Link cameras require support from your phone and browser."
        : name === "NotReadableError" ? "The camera is busy. Close other camera apps or browser tabs, then press Connect."
        : error instanceof Error ? error.message : "Could not connect the camera.";
      setMessage(`Camera error: ${explanation}`);
    } finally {
      connectingRef.current = false;
      if (connection === connectionRef.current) setConnecting(false);
    }
  }, [prepareSound, cancelSound]);

  async function upload(blob: Blob) {
    setUploadStatus("saving");
    setUploadState("Saving photo…");
    try {
      if (blob.size > MAX_PHOTO_BYTES) throw new Error(PHOTO_SIZE_ERROR);
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json() as { error?: string; saved?: boolean; quota?: unknown };
      if (isPhotoQuota(result.quota)) setQuota(result.quota);
      if (!response.ok) throw new Error(result.error ?? "Could not save photo.");
      if (result.saved !== true) throw new Error("The server did not confirm that the photo was saved.");
      setUploadStatus("saved");
      setUploadState("Saved privately for the host.");
    } catch (error) {
      setUploadStatus("failed");
      setUploadState(error instanceof Error ? `Not saved online: ${error.message}` : "Not saved online.");
      void refreshQuota();
    }
  }

  function capture() {
    const source = canvasRef.current;
    if (!source || !source.width || !connected || !frameReady || streamRef.current?.getVideoTracks()[0]?.readyState !== "live") {
      captureBusyRef.current = false;
      setMessage("Connect a camera and wait for the frame before taking a photo.");
      return;
    }
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d");
    if (!context) { captureBusyRef.current = false; setMessage("Could not create the photo."); return; }
    context.drawImage(source, 0, 0);
    sounds.play("shutter");
    output.toBlob((blob) => {
      if (!blob) { captureBusyRef.current = false; setMessage("Could not export the photo."); return; }
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      void upload(blob);
    }, "image/jpeg", 0.94);
  }

  function startCountdown() {
    if (!connected || !frameReady || !quota || quota.remaining === 0 || photo || captureBusyRef.current || streamRef.current?.getVideoTracks()[0]?.readyState !== "live") return;
    captureBusyRef.current = true;
    setMessage("");
    setCountdown(3);
    sounds.play("countdown");
    let value = 3;
    const tick = () => {
      value -= 1;
      if (value === 0) { setCountdown(null); capture(); return; }
      setCountdown(value);
      sounds.play("countdown");
      timerRef.current = setTimeout(tick, 1000);
    };
    timerRef.current = setTimeout(tick, 1000);
  }

  const voice = useVoiceTrigger(startCountdown);

  return (
    <main className="booth-shell capture-shell">
      <header className="topbar"><div className="brand"><Cloud size={26} /> little cloud <span>PHOTO BOOTH</span></div><div className="account-navigation"><Link href="/gallery" className={buttonVariants({ variant: "outline", className: "booth-navigation" })}>View gallery</Link><SignOut /></div></header>
      <section className="hero"><span className="eyebrow"><Sparkles size={15} /> A LITTLE ONE IS ON THE WAY</span><h1>Welcome to the baby shower!</h1><p>Strike a pose, pick a backdrop, and make a little memory.</p></section>
      <div className="quota-status" aria-live="polite">
        {quota ? <p>{quota.role === "admin" ? "Admin account · Unlimited photo uploads" : `${quota.remaining} of 20 photo uploads remaining`}</p> : !quotaError && <p>Loading your upload allowance...</p>}
        {quota?.remaining === 0 && <p>You have reached your total of 20 photos. You can still view your memories in the gallery.</p>}
        {quotaError && <><p className="notice" role="alert">{quotaError}</p><Button variant="outline" onClick={() => void refreshQuota()}>Retry allowance</Button></>}
      </div>
      <div className="booth-grid">
        <section className="preview-card booth-preview">
          <div className="preview-heading"><div><h2>Your photo booth</h2><p>{connected ? `Camera connected · ${resolution}` : "Connect a camera to get started"}</p></div><span className={connected ? "status on" : "status"}>{connected ? "LIVE" : "OFFLINE"}</span></div>
          <div className="preview" style={{ aspectRatio: "1153 / 768" }}>
            <video ref={videoRef} playsInline muted autoPlay className="camera-source" aria-hidden="true" />
            <canvas ref={canvasRef} aria-label="Live photo booth preview" />
            {!connected && !photo && <div className="preview-placeholder"><Camera size={44} /><strong>Your moment awaits</strong><span>Connect your camera to see the magic.</span></div>}
            {photo && <img className="captured" src={photo.url} alt="Your captured photo" />}
            {countdown !== null && <div className="countdown">{countdown}</div>}
          </div>
          {message && <p className="notice" role="alert">{message}</p>}
          {sounds.error && <p className="notice" role="alert">{sounds.error}</p>}
          <div className="actions">
            {!photo ? <Button className="capture-button" size="lg" disabled={!connected || !frameReady || !quota || quota.remaining === 0 || countdown !== null} onClick={startCountdown}><Cloud /> {countdown !== null ? "Get ready…" : "Take a photo"}</Button> : <><Button size="lg" disabled={uploadStatus === "saving"} onClick={() => { captureBusyRef.current = false; setPhoto(null); setUploadState(""); setUploadStatus("idle"); }}><RefreshCw /> Retake</Button>{uploadStatus === "failed" && <a className={buttonVariants({ variant: "outline", size: "lg" })} href={photo.url} download="baby-shower.jpg"><Download /> Download photo</a>}</>}
            <Button className={`voice-button${voice.status === "off" ? "" : " is-active"}`} variant="outline" size="lg" type="button" aria-pressed={voice.status !== "off"} aria-describedby="voice-disclosure" title="Say capture to start the countdown. Microphone audio may be sent to your browser's speech service." onClick={() => { if (voice.status === "off") { void prepareSound(); voice.start(); } else voice.stop(); }}>
              {voice.status === "off" ? <Mic /> : <MicOff />}
              {voice.status === "off" ? "Enable voice capture" : "Stop voice capture"}
            </Button>
          </div>
          <p className="sr-only" role="status">{voice.status === "listening" ? "Listening for “capture”" : voice.status === "starting" ? "Starting voice recognition…" : voice.status === "reconnecting" ? "Speech service connection failed. Retrying…" : "Voice control is off."}</p>
          <p className="sr-only" id="voice-disclosure">Say capture to start the countdown. Microphone audio may be sent to your browser&apos;s speech service.</p>
          {voice.error && <p className="notice" role="alert">{voice.error}</p>}
          {photo && <div className="upload-result"><p role={uploadStatus === "failed" ? "alert" : "status"}>{uploadState}</p>{uploadStatus === "failed" && <><p className="small">Download this photo as a backup, or retry saving before taking another photo.</p><Button variant="outline" onClick={() => void upload(photo.blob)}>Retry saving</Button></>}</div>}
        </section>
        <aside className="controls-card">
          <Button className="mobile-settings-toggle" variant="outline" type="button" aria-expanded={settingsOpen} aria-controls="booth-settings" onClick={() => setSettingsOpen(!settingsOpen)}>{settingsOpen ? "Hide settings" : "Show settings"}</Button>
          <div id="booth-settings" className={`booth-settings${settingsOpen ? " is-open" : ""}`}>
          <div className="card-title"><span className="icon-bubble"><Sparkles size={19} /></span><h2>Make it yours</h2></div>
          <label htmlFor="camera">CAMERA</label>
          <div className="camera-row"><select id="camera" value={deviceId} disabled={connecting || countdown !== null || photo !== null} onChange={(event) => setDeviceId(event.target.value)}><option value="">Default camera</option><option value="facing:user">Front camera (selfie)</option><option value="facing:environment">Rear camera</option>{devices.filter((device) => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select><Button variant="outline" disabled={connecting || countdown !== null || photo !== null} onClick={() => void connect(deviceId)}>{connecting ? "Connecting..." : "Connect"}</Button></div>
          <p className="small camera-help">On a phone, choose Front camera or Rear camera, then Connect. Use HTTPS and allow camera access. Cam Link availability depends on your device and browser.</p>
          <label className="checkbox"><input type="checkbox" checked={settings.greenScreen} onChange={(event) => setSettings({ ...settings, greenScreen: event.target.checked })} /> Replace green screen</label>
          {settings.greenScreen && <><label>CHOOSE A BACKDROP</label>
          <div className="background-list">{backgrounds.map((item) => <button key={item.url} className={`background-option ${background === item.url ? "selected" : ""}`} aria-pressed={background === item.url} onClick={() => setBackground(item.url)}><img src={item.url} alt="" /><span>{item.name}</span></button>)}</div>
          {!backgrounds.length && <p className="small">Add images to the public/images folder to use a backdrop.</p>}</>}
          <label className="checkbox"><input type="checkbox" checked={settings.mirror} onChange={(event) => setSettings({ ...settings, mirror: event.target.checked })} /> Mirror photo and preview</label>
          <details><summary>Green screen settings</summary><label htmlFor="key">KEY COLOR</label><input id="key" type="color" value={settings.color} onChange={(event) => setSettings({ ...settings, color: event.target.value })} /><label htmlFor="threshold">KEY STRENGTH</label><input id="threshold" type="range" min="0" max="1" step="0.01" value={settings.threshold} onChange={(event) => setSettings({ ...settings, threshold: Number(event.target.value) })} /><label htmlFor="softness">EDGE SOFTNESS</label><input id="softness" type="range" min="0.01" max="1" step="0.01" value={settings.softness} onChange={(event) => setSettings({ ...settings, softness: Number(event.target.value) })} /></details>
          </div>
        </aside>
      </div>
      <footer>Made for little moments &amp; big memories <Cloud size={14} /></footer>
    </main>
  );
}
