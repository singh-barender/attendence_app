/**
 * Shared hardware-readiness check used by both registration Step2 and the
 * login/punch-in fingerprint path — extracted so the two screens can't
 * silently drift on what "ready" means (ADR-005).
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';

export type FingerprintHardwareStatus = 'checking' | 'ready' | 'no-hardware' | 'not-enrolled';

export function useFingerprintHardwareStatus() {
  const [status, setStatus] = useState<FingerprintHardwareStatus>('checking');

  const check = useCallback(async () => {
    setStatus('checking');
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      setStatus('no-hardware');
      return;
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setStatus(isEnrolled ? 'ready' : 'not-enrolled');
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { status, retry: check };
}
