// Android settings this app needs that `expo prebuild` doesn't apply on its own, so a clean
// prebuild reproduces a working build instead of relying on hand edits to android/.
const { withAndroidManifest, withAppBuildGradle, withGradleProperties, withSettingsGradle } = require("@expo/config-plugins");

module.exports = function withCrossPathsAndroid(config) {
  // Allow plain http:// server addresses (self-hosted or dev servers). Android blocks them by default.
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$["android:usesCleartextTraffic"] = "true";
    return c;
  });
  // Compress native libraries inside the APK: ~14 MB instead of ~31 MB for a sideloaded build.
  config = withGradleProperties(config, (c) => {
    // Plus arm64 only and minified/shrunk release builds, so DevStore CI builds the same APK.
    const props = {
      "expo.useLegacyPackaging": "true",
      reactNativeArchitectures: "arm64-v8a",
      "android.enableProguardInReleaseBuilds": "true",
      "android.enableShrinkResourcesInReleaseBuilds": "true",
    };
    c.modResults = c.modResults.filter((p) => !(p.type === "property" && p.key in props));
    for (const [key, value] of Object.entries(props)) c.modResults.push({ type: "property", key, value });
    return c;
  });
  // Modern phones only (arm64): the sideloaded APK stays small. Remove to build all ABIs.
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes('abiFilters "arm64-v8a"')) {
      c.modResults.contents = c.modResults.contents.replace(
        /defaultConfig\s*{/,
        (m) => `${m}\n        ndk { abiFilters "arm64-v8a" }`
      );
    }
    return c;
  });
  // DevStore CI checks out only the repo: Gradle runs `npm ci` when node_modules is missing.
  config = withSettingsGradle(config, (c) => {
    if (!c.modResults.contents.includes('"npm", "ci"')) {
      c.modResults.contents = c.modResults.contents.replace(
        /pluginManagement\s*{/,
        (m) => `${m}
  // DevStore CI checks out only the repo, so install the JS dependencies when they're missing.
  if (!new File(rootDir, "../node_modules/react-native/package.json").exists()) {
    def npm = ["npm", "ci", "--no-audit", "--no-fund"].execute(null, new File(rootDir, ".."))
    npm.waitForProcessOutput(System.out, System.err)
    if (npm.exitValue() != 0) throw new RuntimeException("npm ci failed in mobile/")
  }`
      );
    }
    return c;
  });
  return config;
};
