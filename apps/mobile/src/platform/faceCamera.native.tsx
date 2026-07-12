/**
 * Native face-camera abstraction (task 3.8, ADR-006) — extracted from
 * Step3FaceEnrollScreen/LoginPunchInScreen's previously-inline
 * react-native-vision-camera + ML Kit frame-processor code (tasks 2.1/2.2)
 * so both screens (and their future web counterparts) share one
 * implementation instead of two independent copies of the same camera
 * wiring. A near-pure extraction, not a redesign — with one deliberate,
 * minor behavior difference: `capture()` always writes its temp preview
 * file (previously only capture attempts the quality gate *accepted* were
 * saved to disk). A capture the caller goes on to reject never has its
 * `previewUri` read, so the extra file is simply unused rather than
 * harmful — accepted as a reasonable tradeoff for `capture()` returning
 * one complete, ready-to-use result rather than exposing a second,
 * platform-specific "now save it" step back up to the (platform-neutral)
 * screen.
 *
 * `photo.dispose()` running before the caller uses `capture()`'s returned
 * `image` is safe, not a use-after-free: verified against
 * react-native-vision-camera's own `Photo.nitro.ts` documented example,
 * which explicitly disposes the `Photo` immediately after `toImage()` and
 * continues using the resulting `Image` afterward — `Image` (unlike
 * `Photo`) owns independent native memory once created.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Image } from 'react-native-nitro-image';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { scheduleOnRN } from 'react-native-worklets';
import { mapFaceBoundsToCropRect } from '../utils/faceCrop';
import type {
  CapturedFace,
  FaceCameraViewHandle,
  FaceCameraViewProps,
  LiveFaceInfo,
} from './faceCameraTypes';
import { measureImageQuality } from './imageQualitySignals';

export function useFaceCameraPermission() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  return { hasPermission, requestPermission, hasDevice: device !== undefined };
}

/** Crops to the live face bounds when known (matching the embedder's
 * expectation of a pre-cropped face); falls back to the uncropped image
 * when bounds are missing — the caller's own quality gate (which also
 * checks `hasFace`/`bounds`) rejects that case anyway, so no crop is ever
 * actually needed for a capture that will be rejected. */
function cropToFaceIfKnown(image: Image, faceInfo: LiveFaceInfo): Image {
  if (!faceInfo.bounds) {
    return image;
  }
  const cropRect = mapFaceBoundsToCropRect(
    faceInfo.bounds,
    faceInfo.frameWidth,
    faceInfo.frameHeight,
    image.width,
    image.height,
  );
  return image.crop(cropRect.startX, cropRect.startY, cropRect.endX, cropRect.endY);
}

export const FaceCameraView = forwardRef<FaceCameraViewHandle<Image>, FaceCameraViewProps>(
  function FaceCameraView({ onFrame, onError }, ref) {
    const device = useCameraDevice('front');
    const photoOutput = usePhotoOutput({
      // Matches frameOutput's VGA_4_3 aspect ratio (not its resolution —
      // photos are captured at a higher tier for embedding quality) so a
      // face's fractional position in the live frame maps directly onto
      // the photo's own coordinate space — see utils/faceCrop.ts.
      targetResolution: CommonResolutions.HD_4_3,
    });
    const latestFaceInfoRef = useRef<LiveFaceInfo>({
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
    });

    const faceDetector = useFaceDetector({
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
        // ML Kit's InputImage is built with the frame's rotationDegrees
        // (see react-native-vision-camera-face-detector's
        // ML+HybridFrameSpec.kt), so `firstFace.bounds` is already in the
        // upright/rotated space — but `frame.width`/`frame.height`
        // deliberately stay in the raw, pre-rotation sensor space (per
        // Frame.orientation's own docs, physically rotating buffers is
        // expensive). On a 90°-rotated frame that swap must be mirrored
        // here, or every downstream consumer (centering checks, the
        // embedding crop) silently compares bounds against the wrong axis.
        const isRotated90 = frame.orientation === 'left' || frame.orientation === 'right';
        const frameWidth = isRotated90 ? frame.height : frame.width;
        const frameHeight = isRotated90 ? frame.width : frame.height;
        // Occlusion = the *lower* face (mouth + nose) is missing, which is what
        // a hand or mask covering the face actually hides. Deliberately does
        // NOT include the eye landmarks: a genuine left/right profile shot
        // legitimately loses the far eye, so keying occlusion off the eyes
        // would falsely flag every profile and block profile enrollment.
        const isOccluded = firstFace
          ? !firstFace.landmarks?.MOUTH_BOTTOM || !firstFace.landmarks?.NOSE_BASE
          : false;

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
            }
          : {
              hasFace: false,
              faceCount: 0,
              bounds: null,
              frameWidth,
              frameHeight,
              yawAngle: null,
              leftEyeOpen: null,
              rightEyeOpen: null,
              smileProbability: null,
              pitchAngle: null,
              isOccluded: false,
            };
        scheduleOnRN(recordFrameSeen, info);
        frame.dispose();
      },
    });

    useImperativeHandle(ref, () => ({
      async capture(): Promise<CapturedFace<Image>> {
        const photo = await photoOutput.capturePhoto({}, {});
        try {
          const faceInfo = latestFaceInfoRef.current;
          const image = photo.toImage();
          const { averageBrightness, sharpnessScore } = measureImageQuality(image);
          const croppedImage = cropToFaceIfKnown(image, faceInfo);
          const filePath = await photo.saveToTemporaryFileAsync();

          return {
            image: croppedImage,
            averageBrightness,
            sharpnessScore,
            previewUri: `file://${filePath}`,
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
        isActive
        outputs={[photoOutput, frameOutput]}
        {...(onError ? { onError } : {})}
      />
    );
  },
);
