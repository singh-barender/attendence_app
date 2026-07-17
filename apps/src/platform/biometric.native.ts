/**
 * Whether this platform can support fingerprint verification at all
 * (ADR-005) — a single explicit source of truth so screens don't have to
 * infer platform support indirectly from `useFingerprintHardwareStatus`'s
 * result, which conflates two different questions: "does this platform
 * support fingerprint at all" vs. "does this specific device have working
 * hardware enrolled." Android supports it in principle; whether a given
 * device actually has a sensor/enrollment is still `useFingerprintHardwareStatus`'s
 * job to check.
 */
export const FINGERPRINT_SUPPORTED = true;
