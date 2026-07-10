/**
 * Root component — wraps the app in PersistQueryClientProvider (ADR-012/
 * ADR-013 for the base client, task 4.8/ADR-017 for offline-tolerant punch
 * submission), ThemePreferenceProvider (task 4.7, ADR-009), TamaguiProvider,
 * SafeAreaProvider (was an installed-but-unused dependency of Tamagui's
 * Sheet — never actually wrapped around the app, so `useSafeAreaInsets`
 * would have returned zero insets everywhere), then the navigation shell
 * (task 1.14). Restores a previously-issued session token (task 1.18) on
 * cold start so a returning user's last punch-in session still
 * authenticates attendance-history queries.
 *
 * `PersistQueryClientProvider` replaces the plain `QueryClientProvider`
 * (task 4.8) — it restores the persisted cache on mount, then its
 * `onSuccess` callback (fired once restoration completes) is the correct
 * place to call `resumePausedMutations()`, per ADR-017: a mutation that
 * was queued-but-paused when the app last closed (offline at the time)
 * needs the cache restored first, then an explicit resume, not before.
 *
 * `TamaguiProvider`'s own `defaultTheme` only sets the very first paint —
 * it isn't reactive to later changes (a real Tamagui gotcha, not assumed:
 * confirmed via the library's own prop naming/typing, `defaultTheme` vs. no
 * separate controlled `theme` prop at that level). Runtime theme switching
 * goes through a nested `<Theme name={resolvedTheme}>`, which does react
 * to prop changes, so ProfileScreen's toggle takes effect immediately
 * without remounting the whole provider tree.
 *
 * `GradientBackground` (user-requested redesign) is mounted once here,
 * behind the whole navigator — every screen's own background is
 * transparent (`RootNavigator`'s `screenOptions`) so this one gradient
 * shows through everywhere instead of each screen painting its own.
 * `@tamagui/native/setup-expo-linear-gradient` must run before any
 * `LinearGradient` renders on native, or it silently renders nothing
 * (confirmed from the library's own source) — importing it here, once, at
 * the app's actual entry point is the documented way to do that.
 */
import '@tamagui/native/setup-expo-linear-gradient';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme } from 'tamagui';
import { GradientBackground } from './src/components/GradientBackground';
import { ThemePreferenceProvider, useThemePreference } from './src/contexts/ThemePreferenceContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setAuthToken } from './src/services/graphqlClient';
import { persister, queryClient } from './src/services/queryClient';
import { loadToken } from './src/services/tokenStorage';
import { tamaguiConfig } from './tamagui.config';

function AppContent() {
  const { resolvedTheme } = useThemePreference();

  useEffect(() => {
    loadToken().then((token) => setAuthToken(token));
  }, []);

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
      <Theme name={resolvedTheme}>
        <GradientBackground>
          <RootNavigator />
        </GradientBackground>
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      </Theme>
    </TamaguiProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
        onSuccess={() => queryClient.resumePausedMutations()}
      >
        <ThemePreferenceProvider>
          <AppContent />
        </ThemePreferenceProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
