/**
 * Step 1 of registration (requirements.md) — collects basic info and calls
 * the real `registerStep1` mutation (ADR-012 generated hook). Server is the
 * authoritative validator (userService.ts); client-side checks here are
 * immediate UX feedback only, per the same philosophy as ADR-007.
 */
import {
  MAX_REGISTRATION_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_REGISTRATION_AGE,
} from '@attendance-app/shared-types';
import { useState } from 'react';
import { Button, Fieldset, Input, Label, Spinner, Text } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { GlassCard } from '../../components/GlassCard';
import { IconInput } from '../../components/IconInput';
import { InlineSelectField } from '../../components/InlineSelectField';
import { PasswordInput } from '../../components/PasswordInput';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StepProgress } from '../../components/StepProgress';
import { useThemePreference } from '../../contexts/ThemePreferenceContext';
import { useRegisterStep1Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { setAuthToken } from '../../services/graphqlClient';
import { getErrorMessage } from '../../services/graphqlError';
import { saveToken } from '../../services/tokenStorage';
import { GLASS_PALETTES } from '../../theme/glassPalette';
import { isValidEmail } from '../../utils/validation';

const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;

interface FieldErrors {
  fullName?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  age?: string | undefined;
}

export function Step1BasicInfoScreen({ navigation, route }: RootScreenProps<'RegisterStep1'>) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [fullName, setFullName] = useState('');
  // Pre-filled from the email typed on Login's lookup step when we arrived via
  // the "account not found → Register" path (still fully editable here).
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { mutate, isPending, error, isError } = useRegisterStep1Mutation({
    // registerStep1 now issues a session token immediately, the same way
    // login does (architecture-review-2026-07-16.md's F2b) — store it right
    // away so Step 2/3's mutations (which derive the account from this
    // session rather than taking a client-supplied userId) are authenticated
    // for the rest of the wizard.
    onSuccess: async (data) => {
      const token = data.registerStep1?.token;
      const userId = data.registerStep1?.user?.id;
      if (token && userId) {
        await saveToken(token);
        setAuthToken(token);
        // `replace`, not `navigate` — removes this screen from the stack so
        // going back from Step 2 can't return to a stale, resubmittable copy
        // of this form. registerStep1 is a one-time account `create`, unlike
        // registerStep2/registerStep3 (which safely tolerate being re-run —
        // see userService.assertRegistrationNotComplete): resubmitting it
        // with the same email always fails with "account already exists,"
        // confusingly, since the account in question is the user's own one
        // they just created seconds ago. Resuming a genuinely abandoned
        // registration already works via re-login (requirements.md's
        // "Registration is resumable/idempotent per step" — AuthLoginScreen
        // routes by `registrationStep`), so there's no legitimate reason to
        // ever land back on this screen post-success.
        navigation.replace('RegisterStep2', { userId, email: email.trim() });
      }
    },
  });

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!fullName.trim()) {
      errors.fullName = 'Full name is required.';
    }
    if (!isValidEmail(email)) {
      errors.email = 'Enter a valid email address.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (age.trim()) {
      const parsedAge = Number(age);
      if (parsedAge < MIN_REGISTRATION_AGE || parsedAge > MAX_REGISTRATION_AGE) {
        errors.age = `Age must be between ${MIN_REGISTRATION_AGE} and ${MAX_REGISTRATION_AGE}.`;
      }
    }
    return errors;
  }

  function handleSubmit() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    mutate({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      age: age.trim() ? Number(age) : undefined,
      gender: gender || undefined,
    });
  }

  return (
    <ScreenContainer
      title="Basic Info"
      description="Let's start with a few details. Your email and password sign you in; your face or fingerprint is what records each check-in and check-out."
      progress={<StepProgress step={1} total={3} label="Basic info" />}
    >
      <GlassCard gap="$3">
        <Fieldset gap="$2">
          <Label htmlFor="fullName">Full name</Label>
          <IconInput
            icon="person-outline"
            id="fullName"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
            autoCapitalize="words"
            placeholder="Jordan Rivera"
            returnKeyType="next"
          />
          {fieldErrors.fullName ? (
            <FeedbackBanner variant="error" message={fieldErrors.fullName} />
          ) : null}
        </Fieldset>

        <Fieldset gap="$2">
          <Label htmlFor="email">Email</Label>
          <IconInput
            icon="mail-outline"
            id="email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            returnKeyType="next"
          />
          {fieldErrors.email ? (
            <FeedbackBanner variant="error" message={fieldErrors.email} />
          ) : null}
        </Fieldset>

        <Fieldset gap="$2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            textContentType="newPassword"
            returnKeyType="next"
          />
          {fieldErrors.password ? (
            <FeedbackBanner variant="error" message={fieldErrors.password} />
          ) : null}
        </Fieldset>

        <Fieldset gap="$2">
          <Label htmlFor="age">Age (optional)</Label>
          <Input
            id="age"
            value={age}
            onChangeText={(text) => {
              setAge(text.replace(/\D/g, ''));
              setFieldErrors((prev) => ({ ...prev, age: undefined }));
            }}
            keyboardType="number-pad"
          />
          {fieldErrors.age ? <FeedbackBanner variant="error" message={fieldErrors.age} /> : null}
        </Fieldset>

        <Fieldset gap="$2">
          <Label htmlFor="gender">Gender (optional)</Label>
          <InlineSelectField
            value={gender}
            onValueChange={setGender}
            options={GENDER_OPTIONS}
            placeholder="Select..."
          />
        </Fieldset>

        {isError ? <FeedbackBanner variant="error" message={getErrorMessage(error)} /> : null}

        <Button
          onPress={handleSubmit}
          disabled={isPending}
          style={{ backgroundColor: palette.accent }}
          {...(isPending ? { icon: <Spinner /> } : {})}
        >
          <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
            {(isPending ? 'Submitting...' : 'Step 2').toUpperCase()}
          </Text>
        </Button>
      </GlassCard>
    </ScreenContainer>
  );
}
