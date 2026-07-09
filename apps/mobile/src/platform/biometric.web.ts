/**
 * Browsers never expose the OS fingerprint sensor to web pages, and this
 * project deliberately doesn't use WebAuthn as a stand-in (ADR-005) — so
 * fingerprint is unconditionally unsupported on web, regardless of the
 * specific browser/device. See biometric.native.ts for the counterpart.
 */
export const FINGERPRINT_SUPPORTED = false;
