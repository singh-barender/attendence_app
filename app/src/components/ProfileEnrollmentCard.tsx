/**
 * The "Enrollment status" card on `ProfileScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Button, YStack } from 'tamagui';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { GlassCard } from './GlassCard';
import { EnrollmentRow, SectionHeading } from './ProfileRows';

export interface ProfileEnrollmentCardProps {
  faceEnrolled: boolean;
  fingerprintEnrolled: boolean;
  onReEnrollFace: () => void;
  onReEnrollFingerprint: () => void;
}

export function ProfileEnrollmentCard({
  faceEnrolled,
  fingerprintEnrolled,
  onReEnrollFace,
  onReEnrollFingerprint,
}: ProfileEnrollmentCardProps) {
  return (
    <GlassCard>
      <SectionHeading>Enrollment status</SectionHeading>
      <EnrollmentRow label="Face" enrolled={faceEnrolled} />
      {FINGERPRINT_SUPPORTED ? (
        <EnrollmentRow label="Fingerprint" enrolled={fingerprintEnrolled} />
      ) : null}
      {/* Stacked full-width (matching the Data Controls card) rather than
          side-by-side: "Re-enroll fingerprint" is too long to fit a
          half-width button and was truncating to "Re-enroll fingerpri…". */}
      <YStack gap="$2" mt="$2">
        <Button size="$3" onPress={onReEnrollFace}>
          Re-enroll face
        </Button>
        {FINGERPRINT_SUPPORTED ? (
          <Button size="$3" onPress={onReEnrollFingerprint}>
            Re-enroll fingerprint
          </Button>
        ) : null}
      </YStack>
    </GlassCard>
  );
}
