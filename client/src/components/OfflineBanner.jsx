import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '../offline/connectivity.js';

function relativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// cachedAt is only meaningful while genuinely offline: once reconnected there's a brief "synced"
// flash instead, so a stale timestamp never lingers on screen after the network comes back.
export default function OfflineBanner({ cachedAt }) {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return undefined;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div className={`offline-banner${isOnline ? ' offline-banner-reconnected' : ''}`}>
      {isOnline
        ? "Back online, you're all synced up."
        : `You're offline. Showing data from ${cachedAt ? relativeTime(cachedAt) : 'your last visit'}.`}
    </div>
  );
}
