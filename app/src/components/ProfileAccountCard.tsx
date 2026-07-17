/**
 * The "Account" card on `ProfileScreen`, split out (coding-standards.md's
 * "small, modular, single-responsibility files").
 */

import { formatMemberSince, formatRelativeTime } from '../utils/formatDateTime';
import { GlassCard } from './GlassCard';
import { InfoRow, SectionHeading } from './ProfileRows';

export interface ProfileAccountCardProps {
  fullName: string | null | undefined;
  email: string | null | undefined;
  age: number | null | undefined;
  gender: string | null | undefined;
  createdAt: string | null | undefined;
  /** "Last verified" trust indicator (task 4.13 follow-up) — derived from
   * the audit trail `myVerificationAttempts` already fetches, not a new
   * query. Only a *successful* attempt counts as "verified". */
  lastVerifiedTimestamp: string | null | undefined;
}

export function ProfileAccountCard({
  fullName,
  email,
  age,
  gender,
  createdAt,
  lastVerifiedTimestamp,
}: ProfileAccountCardProps) {
  return (
    <GlassCard>
      <SectionHeading>Account</SectionHeading>
      <InfoRow label="Name" value={fullName ?? '—'} />
      <InfoRow label="Email" value={email ?? '—'} />
      {age != null ? <InfoRow label="Age" value={String(age)} /> : null}
      {gender ? <InfoRow label="Gender" value={gender} /> : null}
      {createdAt ? <InfoRow label="Member since" value={formatMemberSince(createdAt)} /> : null}
      {lastVerifiedTimestamp ? (
        <InfoRow label="Last verified" value={formatRelativeTime(lastVerifiedTimestamp)} />
      ) : null}
    </GlassCard>
  );
}
