// Extends Expo's own default Metro config (which already auto-configures
// pnpm monorepo resolution, SDK 52+ — no manual watchFolders/nodeModulesPaths
// needed) to register `tflite` as a loadable asset extension, per
// react-native-fast-tflite's own setup docs (task 2.4) — required so
// `require('./model.tflite')` resolves as a bundled asset rather than a
// failed module import.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

// Metro's file watcher walks every directory under the project root, including
// the native android/ project — once a native module (task 2.4's
// react-native-fast-tflite) adds CMake/.cxx build output, that tree alone adds
// tens of thousands of generated directories and exhausts the OS's inotify
// watch limit (ENOSPC). None of it is JS source, so it's excluded from the
// same blockList Metro already uses for module resolution (which also feeds
// its file-watcher ignore pattern, per metro-config's own
// node-haste/DependencyGraph/createFileMap.js).
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  /android\/(build|\.gradle|\.cxx)\/.*/,
];

module.exports = config;
