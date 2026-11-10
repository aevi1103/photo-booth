"use client";

import { useEffect, useRef, useState } from "react";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechError = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useVoiceTrigger(onCapture: () => void) {
  const callbackRef = useRef(onCapture);
  const recognitionRef = useRef<Recognition | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"off" | "starting" | "listening" | "reconnecting">("off");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");

  useEffect(() => { callbackRef.current = onCapture; }, [onCapture]);
  useEffect(() => () => {
    if (restartRef.current) clearTimeout(restartRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
  }, []);

  function stop() {
    if (restartRef.current) clearTimeout(restartRef.current);
    restartRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setStatus("off");
  }

  function start() {
    if (recognitionRef.current) return;
    setError("");
    setTranscript("");
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Voice control is not supported in this browser. Use the Take a photo button.");
      return;
    }
    const recognition = new Constructor();
    let networkRetries = 0;
    let retryingNetwork = false;
    const triggeredResults = new Set<number>();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (recognitionRef.current !== recognition) return;
      triggeredResults.clear();
      setStatus("listening");
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      networkRetries = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        setTranscript(result[0].transcript);
        if (!triggeredResults.has(i) && /\bcapture\b/i.test(result[0].transcript)) {
          triggeredResults.add(i);
          callbackRef.current();
        }
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition || event.error === "no-speech") return;
      if (event.error === "network" && networkRetries < 2) {
        networkRetries++;
        retryingNetwork = true;
        setStatus("reconnecting");
        return;
      }
      recognitionRef.current = null;
      setStatus("off");
      if (event.error === "network") {
        const integratedBrowser = /\b(?:Code|Electron)\//i.test(navigator.userAgent);
        setError(integratedBrowser
          ? "Voice recognition could not reach the speech service in this embedded browser. Open the booth in standalone Google Chrome and try again. You can still use Take a photo."
          : "Voice recognition could not reach the browser's speech service. Check your internet connection and try Google Chrome; VPNs, firewalls, or browser settings may block the service. You can still use Take a photo.");
      } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone or speech recognition permission was denied. Allow it in your browser and try again.");
      } else if (event.error === "audio-capture") {
        setError("Could not access a microphone. Check the selected microphone and browser permission, then try again.");
      } else {
        setError(`Voice control stopped (${event.error}). Check your microphone and browser, then try again.`);
      }
      recognition.abort();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setStatus(retryingNetwork ? "reconnecting" : "starting");
      restartRef.current = setTimeout(() => {
        restartRef.current = null;
        if (recognitionRef.current !== recognition) return;
        retryingNetwork = false;
        try { recognition.start(); }
        catch (cause) {
          recognitionRef.current = null;
          setStatus("off");
          setError(cause instanceof Error ? `Could not resume voice control: ${cause.message}` : "Could not resume voice control.");
        }
      }, retryingNetwork ? 1500 : 500);
    };
    try { setStatus("starting"); recognition.start(); }
    catch (cause) {
      recognitionRef.current = null;
      setStatus("off");
      setError(cause instanceof Error ? `Could not start voice control: ${cause.message}` : "Could not start voice control.");
    }
  }

  return { status, error, transcript, start, stop };
}
