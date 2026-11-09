"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Cloud, Images } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SignOut } from "@/components/sign-out";

type Photo = { name: string; createdAt: string; url: string };
type PhotoPage = { photos: Photo[]; nextOffset: number | null };

async function fetchPhotos(offset: number) {
  const response = await fetch(`/api/photos?offset=${offset}`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Could not load photos. Please retry.");
    if (response.status === 401) error.name = "SignInRequired";
    throw error;
  }
  return result as PhotoPage;
}

export function Gallery() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const load = useCallback((offset = 0) => {
    return fetchPhotos(offset).then((result) => {
      setError("");
      setPhotos((previous) => offset === 0 ? result.photos : [...previous, ...result.photos.filter((photo) => !previous.some((item) => item.name === photo.name))]);
      setNextOffset(result.nextOffset);
      setFailedImages([]);
    }).catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "SignInRequired") {
          setPhotos([]);
          setNextOffset(null);
          router.replace("/login");
        }
      setError(cause instanceof Error ? cause.message : "Could not load photos. Check your connection and retry.");
    }).finally(() => {
      setLoading(false);
    });
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="booth-shell gallery-shell">
      <header className="topbar">
        <div className="brand"><Cloud size={26} /> little cloud <span>PHOTO BOOTH</span></div>
        <div className="account-navigation"><Link href="/" className={buttonVariants({ variant: "outline", className: "booth-navigation" })}>Back to booth</Link><SignOut /></div>
      </header>
      <section className="hero">
        <span className="eyebrow"><Images size={15} /> LITTLE MOMENTS, BIG MEMORIES</span>
        <h1>Photo gallery</h1>
        <p>Your saved baby-shower memories, newest first. Admins can view all event photos.</p>
      </section>
        <section className="preview-card p-5" aria-label="Saved photos">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p role="status">{photos.length} {photos.length === 1 ? "photo" : "photos"} loaded</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); void load(); }}>Refresh photos</Button>
            </div>
          </div>
          {!photos.length && !loading && <p className="py-12 text-center">No photos yet. Capture a photo in the booth to start making memories.</p>}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <figure key={photo.name} className="gallery-photo overflow-hidden rounded-xl border bg-white">
                <a href={photo.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open photo ${photo.name}`}>
                  <img className="w-full aspect-[1153/768] object-contain" src={photo.url} alt={`Saved photo ${photo.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImages((previous) => previous.includes(photo.name) ? previous : [...previous, photo.name])} />
                </a>
                <figcaption className="p-3 text-sm">
                  {new Date(photo.createdAt).toLocaleString()}
                  {failedImages.includes(photo.name) && <p role="alert">Image unavailable or link expired. Refresh photos to retry.</p>}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-5 text-center">
            {loading && <p role="status">Loading photos...</p>}
            {nextOffset !== null && <Button disabled={loading} onClick={() => { setLoading(true); void load(nextOffset); }}>Load more photos</Button>}
          </div>
          <p className="small mt-4">Click a photo to open the full image. Private image links expire after 15 minutes; refresh to renew them. Signing out does not revoke image links already opened or shared.</p>
        </section>
      {error && <p className="notice" role="alert">{error}</p>}
    </main>
  );
}
