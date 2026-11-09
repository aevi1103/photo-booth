"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Cloud, Download, RefreshCw, Settings2, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { createCompositor } from "@/lib/compositor";
import { getSupabase, type Background } from "@/lib/supabase";

type Compositor = ReturnType<typeof createCompositor>;
type Photo = { url: string; blob: Blob };
const initialSettings = { color: "#00a000", threshold: 0.25, softness: 0.20, mirror: false };

export function Booth() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef(initialSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [background, setBackground] = useState("");
  const [connected, setConnected] = useState(false);
  const [resolution, setResolution] = useState("");
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [frame, setFrame] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploadState, setUploadState] = useState("");
  const [boothCode, setBoothCode] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const client = getSupabase();
        const { data, error } = await client.from("backgrounds").select("id,name,path").order("created_at", { ascending: false });
        if (error) throw error;
        if (active) {
          setBackgrounds(data ?? []);
          if (data?.length) setBackground(data[0].path);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Could not load backgrounds.");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    let compositor: Compositor;
    try { compositor = createCompositor(canvas); }
    catch (error) { queueMicrotask(() => setMessage(error instanceof Error ? error.message : "Could not start the preview.")); return; }
    compositorRef.current = compositor;
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
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearTimeout(timerRef.current);
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
    image.src = getSupabase().storage.from("backgrounds").getPublicUrl(background).data.publicUrl;
    return () => { cancelled = true; };
  }, [background]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const connect = useCallback(async (selected: string) => {
    setMessage("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setConnected(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...(selected ? { deviceId: { exact: selected } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.onended = () => { setConnected(false); setMessage("Camera disconnected. Reconnect it and select Connect camera."); };
      if (!videoRef.current) { stream.getTracks().forEach((item) => item.stop()); return; }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const info = track.getSettings();
      setResolution(info.width && info.height ? `${info.width} × ${info.height}` : "Resolution unavailable");
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput"));
      setDeviceId(info.deviceId ?? selected);
      setConnected(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setMessage(error instanceof Error ? `Camera error: ${error.message}` : "Could not connect the camera.");
    }
  }, []);

  async function upload(blob: Blob) {
    setUploadState("Saving photo…");
    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "X-Booth-Code": boothCode },
        body: blob,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save photo.");
      setUploadState("Saved privately for the booth administrator.");
    } catch (error) {
      setUploadState(error instanceof Error ? `Not saved online: ${error.message}` : "Not saved online.");
    }
  }

  function capture() {
    const source = canvasRef.current;
    if (!source || !source.width || !connected) { setMessage("Connect a camera before taking a photo."); return; }
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const context = output.getContext("2d");
    if (!context) { setMessage("Could not create the photo."); return; }
    context.drawImage(source, 0, 0);
    if (frame) {
      const width = Math.max(12, output.width * 0.025);
      context.strokeStyle = "#e5f5ff";
      context.lineWidth = width;
      context.strokeRect(width / 2, width / 2, output.width - width, output.height - width);
      context.fillStyle = "rgba(235, 248, 255, 0.90)";
      context.fillRect(0, output.height - output.height * 0.12, output.width, output.height * 0.12);
      context.fillStyle = "#306c8d";
      context.textAlign = "center";
      context.font = `600 ${Math.round(output.height * 0.045)}px sans-serif`;
      context.fillText("A little one is on the way", output.width / 2, output.height * 0.95);
    }
    output.toBlob((blob) => {
      if (!blob) { setMessage("Could not export the photo."); return; }
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      void upload(blob);
    }, "image/jpeg", 0.94);
  }

  function startCountdown() {
    setMessage("");
    setCountdown(3);
    let value = 3;
    const tick = () => {
      value -= 1;
      if (value === 0) { setCountdown(null); capture(); return; }
      setCountdown(value);
      timerRef.current = setTimeout(tick, 1000);
    };
    timerRef.current = setTimeout(tick, 1000);
  }

  return (
    <main className="booth-shell">
      <header className="topbar"><Link href="/" className="brand"><Cloud size={26} /> little cloud <span>PHOTO BOOTH</span></Link><Link href="/admin" className="admin-link"><Settings2 size={16} /> Admin</Link></header>
      <section className="hero"><span className="eyebrow"><Sparkles size={15} /> A LITTLE ONE IS ON THE WAY</span><h1>Welcome to the baby shower!</h1><p>Strike a pose, pick a backdrop, and make a little memory.</p></section>
      <div className="booth-grid">
        <section className="preview-card">
          <div className="preview-heading"><div><h2>Your photo booth</h2><p>{connected ? `Camera connected · ${resolution}` : "Connect a camera to get started"}</p></div><span className={connected ? "status on" : "status"}>{connected ? "LIVE" : "OFFLINE"}</span></div>
          <div className="preview">
            <video ref={videoRef} playsInline muted className="hidden" />
            <canvas ref={canvasRef} aria-label="Live photo booth preview" />
            {!connected && !photo && <div className="preview-placeholder"><Camera size={44} /><strong>Your moment awaits</strong><span>Connect your camera to see the magic.</span></div>}
            {photo && <img className="captured" src={photo.url} alt="Your captured photo" />}
            {countdown !== null && <div className="countdown">{countdown}</div>}
          </div>
          {message && <p className="notice" role="alert">{message}</p>}
          <div className="actions">
            {!photo ? <Button size="lg" disabled={!connected || countdown !== null} onClick={startCountdown}><Camera /> {countdown !== null ? "Get ready…" : "Take a photo"}</Button> : <><Button size="lg" onClick={() => { setPhoto(null); setUploadState(""); }}><RefreshCw /> Retake</Button><a className={buttonVariants({ variant: "outline", size: "lg" })} href={photo.url} download="baby-shower.jpg"><Download /> Download photo</a></>}
          </div>
          {photo && <div className="upload-result"><p>{uploadState}</p>{uploadState.startsWith("Not saved") && <Button variant="outline" onClick={() => void upload(photo.blob)}>Retry saving</Button>}</div>}
          <p className="privacy">Photos are saved online privately for the booth administrator. Please check with the host if you do not wish to be photographed.</p>
        </section>
        <aside className="controls-card">
          <div className="card-title"><span className="icon-bubble"><Sparkles size={19} /></span><div><h2>Make it yours</h2><p>A few little details</p></div></div>
          <label htmlFor="camera">CAMERA</label>
          <div className="camera-row"><select id="camera" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select><Button variant="outline" onClick={() => void connect(deviceId)}>Connect</Button></div>
          <label>CHOOSE A BACKDROP</label>
          <div className="background-list">{backgrounds.length === 0 ? <p className="small">No backgrounds yet. An administrator can upload some.</p> : backgrounds.map((item) => <button key={item.id} className={`background-option ${background === item.path ? "selected" : ""}`} onClick={() => setBackground(item.path)}><img src={getSupabase().storage.from("backgrounds").getPublicUrl(item.path).data.publicUrl} alt="" /><span>{item.name}</span></button>)}</div>
          <label className="checkbox"><input type="checkbox" checked={frame} onChange={(event) => setFrame(event.target.checked)} /> Add a baby-shower frame</label>
          <label className="checkbox"><input type="checkbox" checked={settings.mirror} onChange={(event) => setSettings({ ...settings, mirror: event.target.checked })} /> Mirror photo and preview</label>
          <details><summary>Green screen settings</summary><label htmlFor="key">KEY COLOR</label><input id="key" type="color" value={settings.color} onChange={(event) => setSettings({ ...settings, color: event.target.value })} /><label htmlFor="threshold">KEY STRENGTH</label><input id="threshold" type="range" min="0" max="1" step="0.01" value={settings.threshold} onChange={(event) => setSettings({ ...settings, threshold: Number(event.target.value) })} /><label htmlFor="softness">EDGE SOFTNESS</label><input id="softness" type="range" min="0.01" max="1" step="0.01" value={settings.softness} onChange={(event) => setSettings({ ...settings, softness: Number(event.target.value) })} /></details>
          <details><summary>Booth setup</summary><label htmlFor="code">PHOTO UPLOAD CODE</label><input id="code" type="password" autoComplete="off" value={boothCode} onChange={(event) => setBoothCode(event.target.value)} placeholder="Enter code from host" /><p className="small">Needed to save photos online. Downloads work without it.</p></details>
        </aside>
      </div>
      <footer>Made for little moments &amp; big memories <Cloud size={14} /></footer>
    </main>
  );
}
