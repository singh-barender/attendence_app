/**
 * Web face-camera abstraction (task 3.8, ADR-006) — the web counterpart to
 * faceCamera.native.tsx, using `getUserMedia` for the live preview and
 * @vladmandic/human for per-frame detection. Exposes the exact same
 * `useFaceCameraPermission()`/`FaceCameraView` public shape so
 * Step3FaceEnrollScreen/LoginPunchInScreen (neither platform-split) work
 * identically either way.
 */
import type { FaceResult } from '@vladmandic/human';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type {
  CapturedFace,
  FaceCameraViewHandle,
  FaceCameraViewProps,
  LiveFaceInfo,
} from './faceCameraTypes';
import { eyeOpenProbabilityFrom, yawDegreesFrom } from './humanFaceExtraction.web';
import { getHuman } from './humanInstance.web';
import { measureImageQuality } from './imageQualitySignals.web';

/**
 * How often the live per-frame detection loop runs. Human's full `detect()`
 * (even with `description` disabled for this cheap path) is too expensive
 * to run at the browser's native ~30-60fps video rate — this mirrors
 * native's own reasoning for downscaling frames before inference
 * (coding-standards.md's Performance section), just via a time interval
 * instead of a resolution cap.
 */
const DETECTION_INTERVAL_MS = 150;

function faceResultToLiveInfo(
  face: FaceResult | undefined,
  frameWidth: number,
  frameHeight: number,
): LiveFaceInfo {
  if (!face) {
    return {
      hasFace: false,
      bounds: null,
      frameWidth,
      frameHeight,
      yawAngle: null,
      leftEyeOpen: null,
      rightEyeOpen: null,
    };
  }
  const [x, y, width, height] = face.box;
  return {
    hasFace: true,
    bounds: { x, y, width, height },
    frameWidth,
    frameHeight,
    yawAngle: yawDegreesFrom(face),
    leftEyeOpen: eyeOpenProbabilityFrom(face, 'leftEyeUpper0', 'leftEyeLower0'),
    rightEyeOpen: eyeOpenProbabilityFrom(face, 'rightEyeUpper0', 'rightEyeLower0'),
  };
}

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

export const FaceCameraView = forwardRef<
  FaceCameraViewHandle<HTMLCanvasElement>,
  FaceCameraViewProps
>(function FaceCameraView({ onFrame, onError }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latestFaceRef = useRef<FaceResult | undefined>(undefined);

  // onFrame/onError are fresh closures every render (screens don't
  // memoize them); reading them via refs instead of useEffect
  // dependencies avoids tearing down/restarting the camera stream on
  // every render.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (cancelled) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      // Re-check after every await, not just the first — getHuman() below
      // is itself a second, potentially slow, suspend point (model
      // load/warmup), and unmounting during that gap must not leave an
      // interval started after cleanup already ran (React StrictMode's
      // deliberate mount→unmount→remount in development hits exactly this
      // window on every screen load, not just a rare edge case).
      if (cancelled) {
        return;
      }

      const human = await getHuman();
      if (cancelled) {
        return;
      }
      intervalId = setInterval(async () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2) {
          return;
        }
        try {
          // Cheap path: detector + mesh only, description (the expensive
          // embedding model) stays off for the live per-frame loop — only
          // capture() below needs it, matching native's split between
          // per-frame ML Kit detection and one-shot TFLite embedding.
          const result = await human.detect(currentVideo, {
            face: { description: { enabled: false } },
          });
          const face = result.face[0];
          latestFaceRef.current = face;
          onFrameRef.current(
            faceResultToLiveInfo(face, currentVideo.videoWidth, currentVideo.videoHeight),
          );
        } catch {
          // A single bad frame isn't fatal — skip it and let the next
          // tick retry, rather than surfacing transient per-frame
          // hiccups as a camera-level onError.
        }
      }, DETECTION_INTERVAL_MS);
    }

    start().catch((err: unknown) => {
      if (!cancelled) {
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async capture(): Promise<CapturedFace<HTMLCanvasElement>> {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        throw new Error('Camera is not ready yet.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not create a 2D canvas context.');
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const { averageBrightness, sharpnessScore } = measureImageQuality(canvas);
      return {
        image: canvas,
        averageBrightness,
        sharpnessScore,
        previewUri: canvas.toDataURL('image/jpeg'),
      };
    },
  }));

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
});
