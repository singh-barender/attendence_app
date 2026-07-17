/**
 * The list of already-captured angle thumbnails (with Retake buttons) on
 * `FaceEnrollmentCapture`, split out (coding-standards.md's "small, modular,
 * single-responsibility files").
 */
import { Image } from 'react-native';
import { Button, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { ANGLE_INFO, ANGLES, type Angle } from '../utils/faceAngles';

export interface CapturedAnglesListProps {
  photos: Partial<Record<Angle, { previewUri: string }>>;
  onRetake: (angle: Angle) => void;
}

export function CapturedAnglesList({ photos, onRetake }: CapturedAnglesListProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <YStack gap="$2">
      {ANGLES.map((angle) =>
        photos[angle] ? (
          <YStack key={angle} gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* React Native's own Image (not Tamagui's) renders the captured
                `file://` (native) / `data:` (web) preview reliably; Tamagui's
                Image was leaving these local-URI thumbnails blank. The
                palette-tinted background is a visible placeholder so the
                slot reads as an image frame even while it decodes. */}
            <Image
              source={{ uri: photos[angle].previewUri }}
              style={{
                width: 60,
                height: 60,
                borderRadius: 8,
                backgroundColor: palette.glassBorder,
              }}
            />
            <Text style={{ color: palette.ink }} flex={1}>
              {ANGLE_INFO[angle].label}
            </Text>
            <Button size="$2" onPress={() => onRetake(angle)}>
              Retake
            </Button>
          </YStack>
        ) : null,
      )}
    </YStack>
  );
}
