/**
 * State/handlers for guided left/right/frontal face capture, split out of
 * `FaceEnrollmentCapture.tsx` (coding-standards.md's "small, modular,
 * single-responsibility files").
 */
import type { ComponentRef } from 'react';
import { useRef, useState } from 'react';
import type { FaceCameraView } from '../platform/faceCamera';
import { FRAME_STATE_THROTTLE_MS, type LiveFaceInfo } from '../platform/faceCameraTypes';
import { faceEmbedder } from '../platform/faceEmbedder';
import { getErrorMessage } from '../services/graphqlError';
import { assessEnrollmentQuality } from '../utils/enrollmentQuality';
import { ANGLE_INFO, ANGLES, type Angle } from '../utils/faceAngles';
import { assessLiveAlignment } from '../utils/liveFaceAlignment';

export interface FaceEnrollmentEmbeddings {
  left: number[];
  right: number[];
  frontal: number[];
}

interface AngleCapture {
  previewUri: string;
  embedding: number[];
}

const EMPTY_FACE_INFO: LiveFaceInfo = {
  hasFace: false,
  faceCount: 0,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
  smileProbability: null,
  pitchAngle: null,
  isOccluded: false,
  mouthBottom: null,
};

export function useFaceEnrollmentCapture(onFinish: (embeddings: FaceEnrollmentEmbeddings) => void) {
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);
  const [photos, setPhotos] = useState<Partial<Record<Angle, AngleCapture>>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraLayoutSize, setCameraLayoutSize] = useState({ width: 0, height: 0 });
  const [frameStats, setFrameStats] = useState<{ count: number; face: LiveFaceInfo }>({
    count: 0,
    face: EMPTY_FACE_INFO,
  });
  const totalFramesSeenRef = useRef(0);
  const lastFrameStatusUpdateRef = useRef(0);

  /**
   * Called on every detected frame by FaceCameraView — drives the live guide
   * overlay/debug readout only. The actual accept/reject decision no longer
   * reads any live-frame snapshot at all (face-verification-pipeline-review
   * -2026-07-16.md) — `handleCapture` below sources every signal from the
   * captured photo itself instead.
   */
  function handleFrame(info: LiveFaceInfo) {
    totalFramesSeenRef.current += 1;

    const now = Date.now();
    if (now - lastFrameStatusUpdateRef.current < FRAME_STATE_THROTTLE_MS) {
      return;
    }
    lastFrameStatusUpdateRef.current = now;
    setFrameStats({ count: totalFramesSeenRef.current, face: info });
  }

  const nextAngle = ANGLES.find((angle) => !photos[angle]);
  const capturedCount = ANGLES.filter((angle) => photos[angle]).length;

  // Drives the live guide overlay/capture gating — reuses the same
  // throttled `frameStats` the debug readout already computes, so this
  // adds no extra per-frame state or re-render pressure.
  const liveAlignment = nextAngle
    ? assessLiveAlignment({
        hasFace: frameStats.face.hasFace,
        faceCount: frameStats.face.faceCount,
        faceBounds: frameStats.face.bounds,
        frameWidth: frameStats.face.frameWidth,
        frameHeight: frameStats.face.frameHeight,
        yawAngle: frameStats.face.yawAngle,
        minYawDegrees: ANGLE_INFO[nextAngle].minYaw,
        maxYawDegrees: ANGLE_INFO[nextAngle].maxYaw,
        isOccluded: frameStats.face.isOccluded,
        leftEyeOpen: frameStats.face.leftEyeOpen,
        rightEyeOpen: frameStats.face.rightEyeOpen,
      })
    : { aligned: false, reason: null };
  const isAligned = liveAlignment.aligned;
  const alignmentReason = liveAlignment.reason;

  async function handleCapture() {
    if (!nextAngle) {
      return;
    }
    setCaptureError(null);

    try {
      const captured = await cameraRef.current?.capture();
      if (!captured) {
        return;
      }

      // Every signal here comes from `captured` — the actual photo just
      // taken — not a live-preview snapshot from before the shutter fired
      // (face-verification-pipeline-review-2026-07-16.md's root-cause fix).
      const quality = assessEnrollmentQuality({
        hasFace: captured.hasFace,
        faceCount: captured.faceCount,
        faceBounds: captured.faceBounds,
        frameWidth: captured.frameWidth,
        frameHeight: captured.frameHeight,
        averageBrightness: captured.averageBrightness,
        sharpnessScore: captured.sharpnessScore,
        leftEyeOpen: captured.leftEyeOpen,
        rightEyeOpen: captured.rightEyeOpen,
        isOccluded: captured.isOccluded,
        mouthRegionSharpnessRatio: captured.mouthRegionSharpnessRatio,
        handDetected: captured.handDetected,
      });
      if (!quality.accepted || !captured.faceBounds) {
        setCaptureError(quality.message ?? 'Capture rejected — please try again.');
        return;
      }

      const { embedding } = await faceEmbedder.computeEmbedding(captured.image);
      setPhotos((prev) => ({
        ...prev,
        [nextAngle]: { previewUri: captured.previewUri, embedding },
      }));
    } catch (err) {
      setCaptureError(getErrorMessage(err, 'Failed to capture photo.'));
    }
  }

  function handleRetake(angle: Angle) {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });
  }

  function handleFinish() {
    if (!photos.left || !photos.right || !photos.frontal) {
      return;
    }
    onFinish({
      left: photos.left.embedding,
      right: photos.right.embedding,
      frontal: photos.frontal.embedding,
    });
  }

  return {
    cameraRef,
    photos,
    captureError,
    setCaptureError,
    cameraLayoutSize,
    setCameraLayoutSize,
    frameStats,
    nextAngle,
    capturedCount,
    isAligned,
    alignmentReason,
    handleFrame,
    handleCapture,
    handleRetake,
    handleFinish,
  };
}
