// Extends Expo's own default Metro config (which already auto-configures
// pnpm monorepo resolution, SDK 52+ — no manual watchFolders/nodeModulesPaths
// needed) to register `tflite` as a loadable asset extension, per
// react-native-fast-tflite's own setup docs (task 2.4) — required so
// `require('./model.tflite')` resolves as a bundled asset rather than a
// failed module import.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

module.exports = config;
