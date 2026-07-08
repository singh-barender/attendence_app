// Tamagui's Babel plugin optimizes styled components at compile time
// (ADR-009) — this is the one required non-default Babel config for it.
// react-native-worklets/plugin (task 2.1, ADR-006 amendment) converts
// 'worklet' functions to run on the frame-processor thread — must be last,
// per Software Mansion's own docs, since it needs to process code after
// every other transform has already run.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@tamagui/babel-plugin', 'react-native-worklets/plugin'],
  };
};
