/**
 * Step 1 of registration (requirements.md) — collects basic info and calls
 * the real `registerStep1` mutation (ADR-012 generated hook). Server is the
 * authoritative validator (userService.ts); client-side checks here are
 * immediate UX feedback only, per the same philosophy as ADR-007.
 */
import { MAX_REGISTRATION_AGE, MIN_REGISTRATION_AGE } from '@attendance-app/shared-types';
import { useState } from 'react';
import { Button, Fieldset, Input, Label, Spinner, Text } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { GlassCard } from '../../components/GlassCard';
import { IconInput } from '../../components/IconInput';
import { InlineSelectField } from '../../components/InlineSelectField';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StepProgress } from '../../components/StepProgress';
import { useThemePreference } from '../../contexts/ThemePreferenceContext';
import { useRegisterStep1Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { getErrorMessage } from '../../services/graphqlError';
import { GLASS_PALETTES } from '../../theme/glassPalette';
import { isValidEmail } from '../../utils/validation';

const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;

interface FieldErrors {
  fullName?: string | undefined;
  email?: string | undefined;
  age?: string | undefined;
}

export function Step1BasicInfoScreen({ navigation }: RootScreenProps<'RegisterStep1'>) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [location, setLocation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { mutate, isPending, error, isError } = useRegisterStep1Mutation({
    onSuccess: (data) => {
      const userId = data.registerStep1?.id;
      if (userId) {
        navigation.navigate('RegisterStep2', { userId });
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
      age: age.trim() ? Number(age) : undefined,
      gender: gender || undefined,
      location: location.trim() || undefined,
    });
  }

  return (
    <ScreenContainer
      title="Basic Info"
      description="Let's start with a few details about you. Your email will be how you're identified when you check in and out later — no password needed."
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

        <Fieldset gap="$2">
          <Label htmlFor="location">Location (optional)</Label>
          <IconInput
            icon="location-outline"
            id="location"
            value={location}
            onChangeText={setLocation}
            placeholder="City, Country"
            returnKeyType="done"
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
            {(isPending ? 'Submitting...' : 'Next: Fingerprint').toUpperCase()}
          </Text>
        </Button>
      </GlassCard>
    </ScreenContainer>
  );
}
