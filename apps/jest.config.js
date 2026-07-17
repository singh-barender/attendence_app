/**
 * jest-expo (ADR-010) mocks the native half of the Expo SDK and configures
 * the RN-specific Babel/transform pipeline — the officially documented preset
 * for testing an Expo app, not a hand-rolled Jest config. Its own
 * `jest-preset.js` (checked directly in node_modules, not assumed) already
 * ships a pnpm-aware `transformIgnorePatterns` (it lists `.pnpm` alongside
 * react-native/expo package names), so nothing needs overriding here.
 */
module.exports = {
  preset: 'jest-expo',
};
