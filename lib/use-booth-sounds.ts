"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useBoothSounds() {
  const contextRef = useRef<AudioContext | null>(null);
  const generationRef = useRef(0);
  const [error, setError] = useState("");

  const reportError = useCallback((cause: unknown) => {
    console.error("Photo booth audio failed:", cause);
    setError("Sound is unavailable. Check your device volume and tap Connect to retry. Photos still work.");
  }, []);

  const prepare = useCallback(async () => {
    try {
      if (!contextRef.current) contextRef.current = new AudioContext();
      if (contextRef.current.state === "suspended") await contextRef.current.resume();
      if (contextRef.current.state !== "running") throw new Error("Audio playback is blocked by the browser.");
      setError("");
      return contextRef.current;
    } catch (cause) {
      reportError(cause);
      return null;
    }
  }, [reportError]);

  const play = useCallback((kind: "countdown" | "shutter") => {
    const generation = generationRef.current;
    const requested = performance.now();
    void prepare().then((context) => {
      if (!context || generation !== generationRef.current || performance.now() - requested > 500) return;
      try {
        const now = context.currentTime;
        const gain = context.createGain();
        gain.connect(context.destination);
        if (kind === "countdown") {
          const tone = context.createOscillator();
          tone.type = "sine";
          tone.frequency.setValueAtTime(880, now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          tone.connect(gain);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
          tone.start(now);
          tone.stop(now + 0.14);
        } else {
          const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
          const shutter = context.createBufferSource();
          shutter.buffer = buffer;
          const filter = context.createBiquadFilter();
          filter.type = "highpass";
          filter.frequency.setValueAtTime(1200, now);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
          gain.gain.setValueAtTime(0.14, now + 0.085);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          shutter.connect(filter);
          filter.connect(gain);
          shutter.onended = () => { shutter.disconnect(); filter.disconnect(); gain.disconnect(); };
          shutter.start(now);
        }
      } catch (cause) {
        reportError(cause);
      }
    });
  }, [prepare, reportError]);

  const cancel = useCallback(() => { generationRef.current++; }, []);

  useEffect(() => () => {
    generationRef.current++;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch((cause: unknown) => console.error("Audio cleanup failed:", cause));
  }, []);

  return { prepare, play, cancel, error };
}
