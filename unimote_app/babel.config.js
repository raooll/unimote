module.exports = {
  presets: [
    ['module:@react-native/babel-preset', { jsxImportSource: 'nativewind' }],
    'nativewind/babel',
  ],
  // Must be last (Reanimated 4 uses the react-native-worklets plugin).
  plugins: ['react-native-worklets/plugin'],
};
