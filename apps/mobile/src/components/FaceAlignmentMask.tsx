/**
 * Overlays the live face-capture camera feed with a dark, blurred surround
 * outside the alignment oval, leaving only the oval's actual interior
 * sharp and unobscured (user-requested).
 *
 * Earlier versions of this approximated the oval cutout with plain `View`s
 * (a bounding-rectangle hole, then a stepped many-band ellipse
 * approximation) because no masking primitive was in this app's dependency
 * set. Both were visibly wrong up close — hard rectangular corners, then
 * seams between the stepped bands — because plain Views have no way to
 * punch an actual hole in another view's alpha; only compositing a real
 * mask against a real vector shape does that correctly. `react-native-svg`
 * (a true `<Ellipse>` + `<Mask>`, exact math, no seams) and
 * `@react-native-masked-view/masked-view` (applies that shape as an alpha
 * mask over an arbitrary native view, here `BlurView` + a dark scrim) are
 * the standard pairing for exactly this "spotlight cutout over a live
 * camera feed" pattern — not a bespoke workaround.
 *
 * Layering (back to front): live camera feed (always sharp, rendered by
 * the caller *before* this component) → `MaskedView`, whose child (a
 * `BlurView` plus a dark scrim) is only visible where `maskElement` is
 * opaque, i.e. everywhere *outside* the SVG ellipse hole → the oval guide
 * border on top.
 */
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';
import { View, YStack } from 'tamagui';
import type { GlassPalette } from '../theme/glassPalette';

interface FaceAlignmentMaskProps {
  containerWidth: number;
  containerHeight: number;
  ovalWidth: number;
  ovalHeight: number;
  isAligned: boolean;
  palette: GlassPalette;
}

/** How dark the surround reads — independent of the theme's glass tint,
 * since this needs to read as a dimmed camera view in both light and dark
 * mode, not a translucent card surface. */
const SURROUND_SCRIM_OPACITY = 0.55;

export function FaceAlignmentMask({
  containerWidth,
  containerHeight,
  ovalWidth,
  ovalHeight,
  isAligned,
  palette,
}: FaceAlignmentMaskProps) {
  if (containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  const radiusX = ovalWidth / 2;
  const radiusY = ovalHeight / 2;

  return (
    <YStack pointerEvents="none" style={ABSOLUTE_FILL}>
      <MaskedView
        style={ABSOLUTE_FILL}
        maskElement={
          <Svg width={containerWidth} height={containerHeight}>
            <Defs>
              <Mask id="alignment-hole">
                <Rect x={0} y={0} width={containerWidth} height={containerHeight} fill="white" />
                <Ellipse cx={centerX} cy={centerY} rx={radiusX} ry={radiusY} fill="black" />
              </Mask>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={containerWidth}
              height={containerHeight}
              fill="white"
              mask="url(#alignment-hole)"
            />
          </Svg>
        }
      >
        <BlurView tint={palette.blurTint} intensity={palette.blurIntensity} style={ABSOLUTE_FILL} />
        <View
          style={{
            ...ABSOLUTE_FILL,
            backgroundColor: `rgba(0, 0, 0, ${SURROUND_SCRIM_OPACITY})`,
          }}
        />
      </MaskedView>
      <YStack
        style={{
          position: 'absolute',
          top: centerY - radiusY,
          left: centerX - radiusX,
          width: ovalWidth,
          height: ovalHeight,
          borderRadius: 999,
          borderWidth: 4,
          borderColor: isAligned ? '#3DBE6B' : '#E05252',
        }}
      />
    </YStack>
  );
}

const ABSOLUTE_FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
