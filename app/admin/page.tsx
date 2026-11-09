"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, LogOut, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabase, type Background } from "@/lib/supabase";

type GalleryPhoto = { path: string; createdAt: string | null; url: string };

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const checkAdmin = useCallback(async () => {
    try {
      const client = getSupabase();
      const { data: user, error: userError } = await client.auth.getUser();
      if (userError || !user.user) { setAdmin(false); return; }
      const { data, error } = await client.rpc("is_booth_admin");
      if (error) throw error;
      setAdmin(data === true);
      if (!data) setNotice("This account is not a booth administrator.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not check administrator access."); }
    finally { setChecking(false); }
  }, []);

  const refresh = useCallback(async () => {
      const client = getSupabase();
      const { data: backgroundsData, error: backgroundError } = await client.from("backgrounds").select("id,name,path").order("created_at", { ascending: false });
      if (backgroundError) throw backgroundError;
      setBackgrounds(backgroundsData ?? []);
      const all: { name: string; created_at: string | null }[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from("photos").list("", { limit: 100, offset, sortBy: { column: "created_at", order: "desc" } });
        if (error) throw error;
        all.push(...data.filter((item) => item.id !== null));
        if (data.length < 100) break;
      }
      if (!all.length) { setPhotos([]); return; }
      const { data: signed, error: signedError } = await client.storage.from("photos").createSignedUrls(all.map((item) => item.name), 3600);
      if (signedError) throw signedError;
      const entries = all.map((item, index) => {
        const signedUrl = signed[index]?.signedUrl;
        if (signed[index]?.error || !signedUrl) throw new Error("Could not access one or more photos.");
        return { path: item.name, createdAt: item.created_at, url: signedUrl };
      });
      setPhotos(entries);
  }, []);

  useEffect(() => { void Promise.resolve().then(checkAdmin); }, [checkAdmin]);
  useEffect(() => {
    if (admin) void Promise.resolve().then(refresh).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load the gallery."));
  }, [admin, refresh]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice("");
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      await checkAdmin();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }

  async function logout() {
    const { error } = await getSupabase().auth.signOut();
    if (error) { setNotice(error.message); return; }
    setAdmin(false); setPhotos([]); setBackgrounds([]);
  }

  async function uploadBackground(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setNotice("Choose a JPEG, PNG, or WebP image smaller than 8 MB."); return;
    }
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 100).trim() || "Background";
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    const path = `${crypto.randomUUID()}.${extension}`;
    setBusy(true); setNotice("");
    try {
      const client = getSupabase();
      const { error: uploadError } = await client.storage.from("backgrounds").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: insertError } = await client.from("backgrounds").insert({ name, path });
      if (insertError) {
        const { error: cleanupError } = await client.storage.from("backgrounds").remove([path]);
        if (cleanupError) throw new Error(`Background could not be registered and cleanup failed: ${cleanupError.message}`);
        throw insertError;
      }
      await refresh();
      setNotice("Background uploaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Background upload failed."); }
    finally { setBusy(false); }
  }

  async function deleteBackground(item: Background) {
    if (!confirm(`Delete the background "${item.name}"?`)) return;
    setBusy(true); setNotice("");
    try {
      const client = getSupabase();
      const { data: removed, error } = await client.storage.from("backgrounds").remove([item.path]);
      if (error) throw error;
      if (!removed.length) throw new Error("Background image could not be deleted.");
      const { data: deleted, error: dbError } = await client.from("backgrounds").delete().eq("id", item.id).select("id");
      if (dbError) throw new Error(`Image deleted, but its listing could not be removed: ${dbError.message}`);
      if (!deleted?.length) throw new Error("Image deleted, but its listing could not be removed.");
      await refresh(); setNotice("Background deleted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete background."); }
    finally { setBusy(false); }
  }

  async function deletePhoto(item: GalleryPhoto) {
    if (!confirm("Permanently delete this photo?")) return;
    setBusy(true); setNotice("");
    try {
      const { data: removed, error } = await getSupabase().storage.from("photos").remove([item.path]);
      if (error) throw error;
      if (!removed.length) throw new Error("Photo could not be deleted.");
      await refresh(); setNotice("Photo deleted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete photo."); }
    finally { setBusy(false); }
  }

  return <main className="booth-shell">
    <header className="topbar"><Link href="/" className="brand"><Cloud size={26} /> little cloud <span>PHOTO BOOTH</span></Link><Link href="/" className="admin-link">← Back to booth</Link></header>
    <section className="hero"><span className="eyebrow">FOR THE HOST</span><h1>Booth administration</h1><p>Manage your backdrops and little memories.</p></section>
    {notice && <p className="notice admin-notice" role="status">{notice}</p>}
    {checking ? <p className="center">Checking access…</p> : !admin ? <form className="admin-panel login" onSubmit={(event) => void login(event)}>
      <h2>Administrator sign in</h2><p>Only invited administrators can manage this booth.</p>
      <label htmlFor="email">EMAIL</label><input id="email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">PASSWORD</label><input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" disabled={busy}>Sign in</Button>
    </form> : <div className="admin-content">
      <div className="admin-actions"><Button variant="outline" onClick={() => void logout()}><LogOut /> Sign out</Button></div>
      <section className="admin-panel"><div className="section-heading"><div><h2>Backdrops</h2><p>These are visible to everyone using the booth.</p></div><label className="upload-button"><Upload size={16} /> Upload image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => void uploadBackground(event)} /></label></div>
        <div className="gallery">{backgrounds.map((item) => <article key={item.id}><img src={getSupabase().storage.from("backgrounds").getPublicUrl(item.path).data.publicUrl} alt={item.name} /><div><span>{item.name}</span><button disabled={busy} onClick={() => void deleteBackground(item)} aria-label={`Delete ${item.name}`}><Trash2 size={17} /></button></div></article>)}</div>
        {!backgrounds.length && <p className="small">No backgrounds uploaded yet.</p>}
      </section>
      <section className="admin-panel"><div className="section-heading"><div><h2>Private photo gallery</h2><p>Only administrators can view and delete saved photos.</p></div><Button variant="outline" onClick={() => void refresh().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load the gallery."))}>Refresh</Button></div>
        <div className="gallery">{photos.map((item) => <article key={item.path}><a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt="Saved baby shower photo" /></a><div><span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Date unavailable"}</span><button disabled={busy} onClick={() => void deletePhoto(item)} aria-label="Delete photo"><Trash2 size={17} /></button></div></article>)}</div>
        {!photos.length && <p className="small">No photos saved yet.</p>}
      </section>
    </div>}
  </main>;
}
