/**
 * The CSV export card on `AttendanceScreen`, split out (coding-standards.md's
 * "small, modular, single-responsibility files") — owns its own
 * exporting-preset/error state since nothing else on the screen needs it.
 */
import { useState } from 'react';
import { Button, Spinner, Text, XStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { exportAttendanceCsv } from '../platform/csvExport';
import { getErrorMessage } from '../services/graphqlError';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { EXPORT_RANGE_PRESETS, type ExportRangePreset, getDateRange } from '../utils/dateRange';
import { FeedbackBanner } from './FeedbackBanner';
import { GlassCard } from './GlassCard';

export function AttendanceExportCard() {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [exportingPreset, setExportingPreset] = useState<ExportRangePreset | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(preset: ExportRangePreset) {
    setExportError(null);
    setExportingPreset(preset);
    try {
      await exportAttendanceCsv(getDateRange(preset));
    } catch (err) {
      setExportError(getErrorMessage(err, 'Failed to export CSV.'));
    } finally {
      setExportingPreset(null);
    }
  }

  return (
    <>
      <GlassCard gap="$2">
        <Text style={{ color: palette.ink, fontWeight: '700' }}>Export report (CSV)</Text>
        <Text style={{ color: palette.inkSoft, fontSize: 12 }}>
          Tap a range to download a per-day attendance report.
        </Text>
        <XStack gap="$2" style={{ flexWrap: 'wrap' }}>
          {EXPORT_RANGE_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="$3"
              onPress={() => handleExport(preset.key)}
              disabled={exportingPreset !== null}
              {...(exportingPreset === preset.key ? { icon: <Spinner /> } : {})}
            >
              <Text style={{ color: palette.ink }}>{preset.label}</Text>
            </Button>
          ))}
        </XStack>
      </GlassCard>
      {exportError ? <FeedbackBanner variant="error" message={exportError} /> : null}
    </>
  );
}
