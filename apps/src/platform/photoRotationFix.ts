/**
 * Front-camera photo-rotation correction, split out of
 * `faceCamera.native.tsx`'s `capture()` (coding-standards.md's "small,
 * modular, single-responsibility files").
 *
 * Confirmed root cause (read directly from vision-camera's Android source,
 * `HybridPhoto.kt`, then verified against a real capture on-device):
 * `Photo.toImage()` builds its correction matrix as
 * `postRotate(orientation.counterRotated().degrees)` applied AFTER
 * `preScale(-1, 1)` for the mirror — for this front camera, whose
 * `photo.orientation` reports `'right'`, that composition order lands the
 * output at the *correct portrait aspect ratio* but with the actual pixel
 * content rotated a further 180° from upright. This was proven, not
 * guessed: a capture was instrumented to log `photo.orientation`/
 * `rawImage.width`/`height`, then the saved file was pulled directly off
 * the device (`adb shell run-as ... cat`) and viewed — orientation was
 * `'right'`, dimensions were already portrait (960x1280), and the pixels
 * were unambiguously upside down. A prior fix guessed a single
 * always-applied ±90° correction, which was necessarily wrong (the true
 * error is 180°, not 90°) — that guess is why it looked "differently wrong"
 * on retest rather than fixed.
 *
 * The `orientation !== 'up'` gate below matches `HybridPhoto.kt`'s own gate
 * for when its (mis-composed) rotation logic runs at all; the width>height
 * fallback covers the separate, structurally distinct case where
 * `toImage()` detects no rotation whatsoever (e.g. orientation misreported
 * as `'up'`) and leaves the image in its raw landscape sensor shape —
 * unconfirmed on this device, but kept as a defensive second correction
 * rather than assuming it can't happen.
 */
import type { Image } from 'react-native-nitro-image';
import type { CameraOrientation } from 'react-native-vision-camera';

/** Fallback correction for the (unconfirmed on this device, but structurally
 * possible per `HybridPhoto.kt`) case where `toImage()` detects no rotation
 * at all and leaves the image in its raw landscape sensor shape. */
const FRONT_CAMERA_PHOTO_ROTATION_FALLBACK_DEGREES = -90;

export function correctFrontCameraPhotoRotation(
  rawImage: Image,
  orientation: CameraOrientation,
): Image {
  if (orientation !== 'up' && rawImage.height >= rawImage.width) {
    return rawImage.rotate(180);
  }
  if (rawImage.width > rawImage.height) {
    return rawImage.rotate(FRONT_CAMERA_PHOTO_ROTATION_FALLBACK_DEGREES);
  }
  return rawImage;
}
