/**
 * Overlays the live face-capture camera feed with a dark, blurred surround
 * outside the alignment guide, leaving only the guide's actual interior
 * sharp and unobscured (user-requested).
 *
 * Earlier versions of this approximated the guide's cutout with plain
 * `View`s (a bounding-rectangle hole, then a stepped many-band ellipse
 * approximation) because no masking primitive was in this app's dependency
 * set. Both were visibly wrong up close — hard rectangular corners, then
 * seams between the stepped bands — because plain Views have no way to
 * punch an actual hole in another view's alpha; only compositing a real
 * mask against a real vector shape does that correctly. `react-native-svg`
 * (a true `<Rect>` + `<Mask>`, exact math, no seams) and
 * `@react-native-masked-view/masked-view` (applies that shape as an alpha
 * mask over an arbitrary native view, here `BlurView` + a dark scrim) are
 * the standard pairing for exactly this "spotlight cutout over a live
 * camera feed" pattern — not a bespoke workaround.
 *
 * The guide itself is a "stadium" shape (straight sides, semicircular top/
 * bottom caps) — user-preferred over a true mathematical ellipse, which
 * reads as too pointed/egg-shaped at this aspect ratio. Both the cutout and
 * the visible border are drawn from the *same* rounded-`<Rect>` geometry
 * (`cornerRadius` below), which is what actually guarantees the border
 * lines up exactly with the blur/sharp edge — an earlier version drew the
 * border as a plain `View` with `borderRadius`, which visibly didn't match
 * this SVG cutout's own curve.
 *
 * Layering (back to front): live camera feed (always sharp, rendered by
 * the caller *before* this component) → `MaskedView`, whose child (a
 * `BlurView` plus a dark scrim) is only visible where `maskElement` is
 * opaque, i.e. everywhere *outside* the rounded-rect hole → the guide's
 * border on top.
 */
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { View, YStack } from 'tamagui';
import type { GlassPalette } from '../theme/glassPalette';

/** Border stroke width for the guide — shared between the SVG rect (below)
 * and its own `strokeWidth` so there's one source of truth for it. */
const OVAL_BORDER_WIDTH = 4;

/** Alignment-guide bounding box, shared by every screen that renders this
 * mask (enrollment, re-enrollment, and login/punch face verification) so
 * they all steer the user toward the exact same framing — a single source
 * of truth rather than each screen picking its own size. */
export const ALIGNMENT_OVAL_WIDTH = 200;
export const ALIGNMENT_OVAL_HEIGHT = 270;

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
  const rectX = centerX - ovalWidth / 2;
  const rectY = centerY - ovalHeight / 2;
  // The corner radius that turns a plain rect into a full "stadium" —
  // capped at half the shorter side, same as React Native's own
  // `borderRadius` capping — so top/bottom are true semicircles.
  const cornerRadius = Math.min(ovalWidth, ovalHeight) / 2;

  return (
    <YStack pointerEvents="none" style={ABSOLUTE_FILL}>
      <MaskedView
        style={ABSOLUTE_FILL}
        maskElement={
          <Svg width={containerWidth} height={containerHeight}>
            <Defs>
              <Mask id="alignment-hole">
                <Rect x={0} y={0} width={containerWidth} height={containerHeight} fill="white" />
                <Rect
                  x={rectX}
                  y={rectY}
                  width={ovalWidth}
                  height={ovalHeight}
                  rx={cornerRadius}
                  ry={cornerRadius}
                  fill="black"
                />
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
      {/* Inset by half the stroke width so the stroke's OUTER edge lands
          exactly on the cutout's own boundary above, not straddling it. */}
      <Svg width={containerWidth} height={containerHeight} style={ABSOLUTE_FILL}>
        <Rect
          x={rectX + OVAL_BORDER_WIDTH / 2}
          y={rectY + OVAL_BORDER_WIDTH / 2}
          width={ovalWidth - OVAL_BORDER_WIDTH}
          height={ovalHeight - OVAL_BORDER_WIDTH}
          rx={cornerRadius - OVAL_BORDER_WIDTH / 2}
          ry={cornerRadius - OVAL_BORDER_WIDTH / 2}
          fill="none"
          stroke={isAligned ? '#3DBE6B' : '#E05252'}
          strokeWidth={OVAL_BORDER_WIDTH}
        />
      </Svg>
    </YStack>
  );
}

const ABSOLUTE_FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
