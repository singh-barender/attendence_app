/**
 * Native face-camera abstraction (task 3.8, ADR-006) — shared by
 * enrollment and verification so neither owns its own copy of the
 * react-native-vision-camera + ML Kit wiring. `capture()` always writes its
 * temp preview file, even for a capture the caller goes on to reject; the
 * file is simply unused in that case, a reasonable tradeoff for one
 * complete, ready-to-use result.
 *
 * `photo.dispose()` before the caller uses `capture()`'s returned `image`
 * is safe, not a use-after-free — verified against vision-camera's own
 * `Photo.nitro.ts` example, which disposes `Photo` right after `toImage()`
 * and keeps using the resulting `Image` (`Image` owns independent memory).
 *
 * The occlusion heuristic (`faceOcclusionHeuristics.ts`), rotation fix
 * (`photoRotationFix.ts`), mouth-region-sharpness ratio
 * (`imageQualitySignals.native.ts`), hand-detection check
 * (`handDetector.native.ts`), and post-capture face re-detection
 * (`capturedPhotoFaceDetection.native.ts`) all live in their own files —
 * this component only wires them together (coding-standards.md's "small,
 * modular, single-responsibility files").
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Image } from 'react-native-nitro-image';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetector, useImageFaceDetector } from 'react-native-vision-camera-face-detector';
import { scheduleOnRN } from 'react-native-worklets';
import { cropToFaceIfKnown } from '../utils/faceCrop';
import { detectFaceOnCapturedImage } from './capturedPhotoFaceDetection';
import type {
  CapturedFace,
  FaceCameraViewHandle,
  FaceCameraViewProps,
  LiveFaceInfo,
} from './faceCameraTypes';
import { computeFaceOcclusion } from './faceOcclusionHeuristics';
import { checkHandNearFace } from './handDetector';
import { computeMouthRegionSharpnessRatio, measureImageQuality } from './imageQualitySignals';
import { correctFrontCameraPhotoRotation } from './photoRotationFix';

/** JPEG quality for the preview thumbnail — a small on-screen preview, not
 * the embedder's input (which reads the in-memory `Image` directly). */
const PREVIEW_JPEG_QUALITY = 80;

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

export function useFaceCameraPermission() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  return { hasPermission, requestPermission, hasDevice: device !== undefined };
}

/**
 * Tracks whether the app itself is currently foregrounded — react-native-
 * vision-camera's own docs are explicit that `<Camera isActive>` must
 * reflect this (screen focus/app foreground state), not a hardcoded `true`:
 * when the app backgrounds, the OS can reclaim the camera hardware out from
 * under a still-"active" session, and resuming it later throws a fatal
 * `ActiveCameraSessionSingle.updateCameraState` error (found live: backgrounding
 * the app mid-capture and returning to it crashed the camera view). Passing
 * the real foreground state lets the library cleanly release/reacquire the
 * session across the transition instead.
 */
function useIsAppActive(): boolean {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);
  return isActive;
}

export const FaceCameraView = forwardRef<FaceCameraViewHandle<Image>, FaceCameraViewProps>(
  function FaceCameraView({ onFrame, onError }, ref) {
    const device = useCameraDevice('front');
    const isAppActive = useIsAppActive();
    const photoOutput = usePhotoOutput({
      // Matches frameOutput's VGA_4_3 aspect ratio (not its resolution —
      // photos are captured at a higher tier for embedding quality) so a
      // face's fractional position in the live frame maps directly onto
      // the photo's own coordinate space — see utils/faceCrop.ts.
      targetResolution: CommonResolutions.HD_4_3,
    });
    const latestFaceInfoRef = useRef<LiveFaceInfo>(EMPTY_FACE_INFO);

    const faceDetector = useFaceDetector({
      performanceMode: 'fast',
      runClassifications: true,
      runLandmarks: true,
    });
    // Re-detects against the actual captured photo at capture() time — see
    // capturedPhotoFaceDetection.native.ts for why the live-frame detector
    // above isn't sufficient for the eye-openness/occlusion decision.
    const imageFaceDetector = useImageFaceDetector({
      performanceMode: 'fast',
      runClassifications: true,
      runLandmarks: true,
    });

    function recordFrameSeen(info: LiveFaceInfo) {
      latestFaceInfoRef.current = info;
      onFrame(info);
    }

    const frameOutput = useFrameOutput({
      // coding-standards.md's Performance section requires downscaling
      // frames before inference — neither ML Kit face detection nor the
      // 112x112 MobileFaceNet embedder benefit from full sensor
      // resolution, so VGA_4_3 (480x640) is requested instead of the
      // sensor's native ~1280x720+.
      targetResolution: CommonResolutions.VGA_4_3,
      pixelFormat: 'yuv',
      onFrame(frame) {
        'worklet';
        const faces = faceDetector.detectFaces(frame);
        const firstFace = faces[0];
        // ML Kit's InputImage is built with the frame's rotationDegrees, so
        // `firstFace.bounds` is already upright — but `frame.width`/`height`
        // deliberately stay in the raw, pre-rotation sensor space (physically
        // rotating buffers is expensive). On a 90°-rotated frame that swap
        // must be mirrored, or downstream consumers compare against the wrong axis.
        const isRotated90 = frame.orientation === 'left' || frame.orientation === 'right';
        const frameWidth = isRotated90 ? frame.height : frame.width;
        const frameHeight = isRotated90 ? frame.width : frame.height;
        const { isOccluded, mouthBottom } = computeFaceOcclusion(firstFace);

        const info: LiveFaceInfo = firstFace
          ? {
              hasFace: true,
              faceCount: faces.length,
              bounds: firstFace.bounds,
              frameWidth,
              frameHeight,
              yawAngle: firstFace.yawAngle ?? null,
              leftEyeOpen: firstFace.leftEyeOpenProbability ?? null,
              rightEyeOpen: firstFace.rightEyeOpenProbability ?? null,
              smileProbability: firstFace.smilingProbability ?? null,
              pitchAngle: firstFace.pitchAngle ?? null,
              isOccluded,
              mouthBottom,
            }
          : { ...EMPTY_FACE_INFO, frameWidth, frameHeight };
        scheduleOnRN(recordFrameSeen, info);
        frame.dispose();
      },
    });

    useImperativeHandle(ref, () => ({
      async capture(): Promise<CapturedFace<Image>> {
        const photo = await photoOutput.capturePhoto({}, {});
        try {
          const rawImage = photo.toImage();
          const image = correctFrontCameraPhotoRotation(rawImage, photo.orientation);

          // Fresh, photo-derived signals — NOT the live-preview ref — so the
          // quality decision judges the same instant as the photo it's
          // deciding on (face-verification-pipeline-review-2026-07-16.md).
          const freshFace = await detectFaceOnCapturedImage(imageFaceDetector, image);

          const { image: croppedImage, cropRect } = cropToFaceIfKnown(
            image,
            freshFace.bounds,
            freshFace.frameWidth,
            freshFace.frameHeight,
          );
          // Measured on the face-cropped region, not the whole frame
          // (face-verification-pipeline-review-2026-07-16.md's finding): a
          // whole-frame average can look normally-exposed while a backlit
          // subject's face is silhouetted and unusably dark, since a bright
          // background pulls the average up. Cropping first, same as the
          // mouth-sharpness/hand-detection checks already do, means exposure
          // and focus are judged on the part of the photo that actually
          // matters.
          const { averageBrightness, sharpnessScore } = measureImageQuality(croppedImage);
          const previewPath = await croppedImage.saveToTemporaryFileAsync(
            'jpg',
            PREVIEW_JPEG_QUALITY,
          );

          const mouthRegionSharpnessRatio = computeMouthRegionSharpnessRatio(
            freshFace.mouthBottom,
            freshFace.frameWidth,
            freshFace.frameHeight,
            image,
            croppedImage,
            cropRect,
          );
          const handDetected = await checkHandNearFace(
            freshFace.bounds,
            freshFace.frameWidth,
            freshFace.frameHeight,
            image,
          );

          return {
            image: croppedImage,
            averageBrightness,
            sharpnessScore,
            previewUri: `file://${previewPath}`,
            mouthRegionSharpnessRatio,
            handDetected,
            hasFace: freshFace.hasFace,
            faceCount: freshFace.faceCount,
            faceBounds: freshFace.bounds,
            frameWidth: freshFace.frameWidth,
            frameHeight: freshFace.frameHeight,
            leftEyeOpen: freshFace.leftEyeOpen,
            rightEyeOpen: freshFace.rightEyeOpen,
            isOccluded: freshFace.isOccluded,
          };
        } finally {
          photo.dispose();
        }
      },
    }));

    if (!device) {
      return null;
    }

    return (
      <Camera
        style={{ flex: 1 }}
        device={device}
        isActive={isAppActive}
        outputs={[photoOutput, frameOutput]}
        {...(onError ? { onError } : {})}
      />
    );
  },
);
