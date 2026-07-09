/**
 * Root component — wraps the app in QueryClientProvider (ADR-012/ADR-013),
 * ThemePreferenceProvider (task 4.7, ADR-009), TamaguiProvider,
 * SafeAreaProvider (was an installed-but-unused dependency of Tamagui's
 * Sheet — never actually wrapped around the app, so `useSafeAreaInsets`
 * would have returned zero insets everywhere), then the navigation shell
 * (task 1.14). Restores a previously-issued session token (task 1.18) on
 * cold start so a returning user's last punch-in session still
 * authenticates attendance-history queries.
 *
 * `TamaguiProvider`'s own `defaultTheme` only sets the very first paint —
 * it isn't reactive to later changes (a real Tamagui gotcha, not assumed:
 * confirmed via the library's own prop naming/typing, `defaultTheme` vs. no
 * separate controlled `theme` prop at that level). Runtime theme switching
 * goes through a nested `<Theme name={resolvedTheme}>`, which does react
 * to prop changes, so ProfileScreen's toggle takes effect immediately
 * without remounting the whole provider tree.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme } from 'tamagui';
import { ThemePreferenceProvider, useThemePreference } from './src/contexts/ThemePreferenceContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setAuthToken } from './src/services/graphqlClient';
import { queryClient } from './src/services/queryClient';
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
        <RootNavigator />
        <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      </Theme>
    </TamaguiProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemePreferenceProvider>
          <AppContent />
        </ThemePreferenceProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
