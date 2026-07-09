/**
 * Root component — wraps the app in QueryClientProvider (ADR-012/ADR-013),
 * TamaguiProvider (ADR-009), SafeAreaProvider (was an installed-but-unused
 * dependency of Tamagui's Sheet — never actually wrapped around the app,
 * so `useSafeAreaInsets` would have returned zero insets everywhere), then
 * the navigation shell (task 1.14). Restores a previously-issued session
 * token (task 1.18) on cold start so a returning user's last punch-in
 * session still authenticates attendance-history queries.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setAuthToken } from './src/services/graphqlClient';
import { queryClient } from './src/services/queryClient';
import { loadToken } from './src/services/tokenStorage';
import { tamaguiConfig } from './tamagui.config';

export default function App() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    loadToken().then((token) => setAuthToken(token));
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme ?? 'light'}>
          <RootNavigator />
          <StatusBar style="auto" />
        </TamaguiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
