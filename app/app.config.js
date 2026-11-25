// Adds build-time values on top of app.json.
//
// ANDROID_VERSION_CODE is set by the GitHub Actions APK build (the run number),
// so each APK has a higher version code than the last and installs over it.
// GITHUB_RUN_NUMBER is the fallback so an over-the-air update published from
// a workflow run records that run's number too.
//
// EAS_PROJECT_ID is the Expo project that carries over-the-air updates. It is
// a repo variable (Settings > Secrets and variables > Actions > Variables), not
// a secret, and not written in app.json, so the app has no update address
// until it is set. Without it the app still runs; it just never updates
// over the air (see app/README.md, "Over-the-air updates").
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId || '';
  return {
    ...config,
    android: {
      ...config.android,
      versionCode: Number(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 1),
    },
    updates: projectId ? { ...config.updates, url: `https://u.expo.dev/${projectId}` } : config.updates,
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};
