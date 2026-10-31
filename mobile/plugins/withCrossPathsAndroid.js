// Android settings this app needs that `expo prebuild` doesn't apply on its own, so a clean
// prebuild reproduces a working build instead of relying on hand edits to android/.
const { withAndroidManifest, withAppBuildGradle, withGradleProperties } = require("@expo/config-plugins");

module.exports = function withCrossPathsAndroid(config) {
  // Plain http:// to a NAS on the LAN (e.g. http://192.168.0.24:8787). Android blocks it by default.
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$["android:usesCleartextTraffic"] = "true";
    return c;
  });
  // Compress native libraries inside the APK: ~14 MB instead of ~31 MB for a sideloaded build.
  config = withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === "property" && p.key === "expo.useLegacyPackaging"));
    c.modResults.push({ type: "property", key: "expo.useLegacyPackaging", value: "true" });
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
  return config;
};
