import { useState, useRef, useEffect } from 'react';

export function useVoice() {
  const [voiceOn,   setVoiceOn]   = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const voicesRef = useRef([]);
  const recogRef  = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  function pickVoice() {
    const vs = voicesRef.current || [];
    return vs.find(v => /en-GB/i.test(v.lang) && /daniel|arthur|male|uk english male/i.test(v.name))
        || vs.find(v => /Google UK English Male/i.test(v.name))
        || vs.find(v => /en-GB/i.test(v.lang))
        || vs.find(v => /en[-_]US/i.test(v.lang))
        || vs[0];
  }

  function speak(text) {
    if (!voiceOn || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = 1.0; u.pitch = 0.82;
    setSpeaking(true);
    u.onend  = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function toggleVoice() {
    setVoiceOn(p => { if (p) stopSpeaking(); return !p; });
  }

  // onResult(transcript) called when speech recognised
  function toggleListen(onResult) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const r = new SR();
    recogRef.current = r;
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = e => { const t = e.results[0][0].transcript; setListening(false); onResult(t); };
    r.onerror  = () => setListening(false);
    r.onend    = () => setListening(false);
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  const srSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return { voiceOn, listening, speaking, srSupported, speak, stopSpeaking, toggleVoice, toggleListen };
}
