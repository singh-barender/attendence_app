/**
 * The "Data controls" card on `ProfileScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files") —
 * data export, logout, and account deletion (ADR-020).
 *
 * Deletion is now a two-stage gate, not just the type-to-confirm text match:
 * a fresh password re-confirmation (`StepUpPasswordConfirmation`, the same
 * component `ReEnrollFaceScreen`/`ReEnrollFingerprintScreen` use) must
 * succeed first, then the existing type-DELETE-to-confirm step. A follow-up
 * review pointed out deletion previously had no server-verifiable gate at
 * all — the text match alone can't prove anything to the server, the same
 * gap F11 already fixed for re-enrollment.
 */
import { Button, Spinner, Text } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { DeleteAccountConfirmation } from './DeleteAccountConfirmation';
import { FeedbackBanner } from './FeedbackBanner';
import { GlassCard } from './GlassCard';
import { SectionHeading } from './ProfileRows';
import { StepUpPasswordConfirmation } from './StepUpPasswordConfirmation';

export interface ProfileDataControlsCardProps {
  isDownloadingData: boolean;
  downloadError: string | null;
  onDownloadData: () => void;
  onLogout: () => void;
  isConfirmingDelete: boolean;
  onStartConfirmingDelete: () => void;
  onCancelConfirmingDelete: () => void;
  deleteStepUpToken: string | null;
  onDeleteStepUpConfirmed: (stepUpToken: string) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
  deleteError: string | null;
}

export function ProfileDataControlsCard({
  isDownloadingData,
  downloadError,
  onDownloadData,
  onLogout,
  isConfirmingDelete,
  onStartConfirmingDelete,
  onCancelConfirmingDelete,
  deleteStepUpToken,
  onDeleteStepUpConfirmed,
  onConfirmDelete,
  isDeleting,
  deleteError,
}: ProfileDataControlsCardProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <GlassCard>
      <SectionHeading>Data controls</SectionHeading>
      {downloadError ? <FeedbackBanner variant="error" message={downloadError} /> : null}
      <Button
        onPress={onDownloadData}
        disabled={isDownloadingData}
        {...(isDownloadingData ? { icon: <Spinner /> } : {})}
      >
        {isDownloadingData ? 'Preparing download...' : 'Download my data'}
      </Button>

      <Button onPress={onLogout} variant="outlined">
        <Text style={{ color: palette.ink, fontWeight: '600' }}>Log out</Text>
      </Button>

      {isConfirmingDelete ? (
        deleteStepUpToken ? (
          <DeleteAccountConfirmation
            onConfirm={onConfirmDelete}
            onCancel={onCancelConfirmingDelete}
            isDeleting={isDeleting}
            deleteError={deleteError}
          />
        ) : (
          <StepUpPasswordConfirmation
            promptMessage="Confirm your password before deleting your account"
            confirmLabel="Confirm password"
            onConfirmed={onDeleteStepUpConfirmed}
          />
        )
      ) : (
        <Button onPress={onStartConfirmingDelete} style={{ backgroundColor: palette.danger }}>
          <Text style={{ color: palette.dangerInk, fontWeight: '700', letterSpacing: 1 }}>
            DELETE MY ACCOUNT
          </Text>
        </Button>
      )}
    </GlassCard>
  );
}
