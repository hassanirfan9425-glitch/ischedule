import { useEffect, useState } from 'react';

// Wraps the browser's native online/offline events — never polled, so this adds zero request
// volume against Render's free-tier hour budget. navigator.onLine reflects the OS/network
// interface state (not a live server health check), which is exactly the "did the network come
// back" signal the mutation queue needs to decide when to replay.
const listeners = new Set();
let online = typeof navigator === 'undefined' ? true : navigator.onLine;

function setOnline(value) {
  if (value === online) return;
  online = value;
  listeners.forEach((listener) => listener(online));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
}

export function isOnline() {
  return online;
}

export function subscribeOnline(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnlineStatus() {
  const [state, setState] = useState(online);
  useEffect(() => subscribeOnline(setState), []);
  return state;
}
