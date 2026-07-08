/**
 * Placeholder body — account info, re-enrollment, verification-attempt
 * audit, data export/delete, theme toggle all arrive in Phase 4 (ADR-018,
 * ADR-019, ADR-020).
 */
import { Button } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootScreenProps } from '../navigation/types';

export function ProfileScreen({ navigation }: RootScreenProps<'Profile'>) {
  return (
    <ScreenContainer
      title="Profile"
      description="Your account info, re-enrollment options, verification activity, and data controls will live here."
    >
      <FeedbackBanner variant="info" message="Profile management is coming in a later update." />
      <Button onPress={() => navigation.navigate('Attendance')}>Back to attendance</Button>
    </ScreenContainer>
  );
}
