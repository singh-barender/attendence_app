/**
 * Web camera-permission state for `faceCamera.web.tsx`, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { useEffect, useState } from 'react';

export function useFaceCameraPermission() {
  const [hasPermission, setHasPermission] = useState(false);
  const hasDevice =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!hasDevice || !navigator.permissions?.query) {
      return;
    }
    let cancelled = false;
    // Best-effort — not every browser supports querying the 'camera'
    // permission's state without prompting (e.g. some Firefox versions);
    // a failure here just leaves hasPermission false until
    // requestPermission() is actually called.
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (cancelled) {
          return;
        }
        setHasPermission(status.state === 'granted');
        status.onchange = () => {
          if (!cancelled) {
            setHasPermission(status.state === 'granted');
          }
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasDevice]);

  async function requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setHasPermission(true);
      return true;
    } catch {
      setHasPermission(false);
      return false;
    }
  }

  return { hasPermission, requestPermission, hasDevice };
}
