import * as Updates from 'expo-updates';
import { displayVersion, formatBuildInfo, shortVersion } from './buildInfo';

// Read once: what's running doesn't change until the app restarts.

/** The full build line, such as "Version 0.1.3 · APK 0.1.0 · build 12 · update 1a2b3c4d, Nov 11". */
export const BUILD_INFO = formatBuildInfo({
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
  createdAt: Updates.createdAt,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  manifest: Updates.manifest,
});

/** "v0.1.3", shown on Settings. */
export const SHORT_VERSION = shortVersion(displayVersion(Updates.runtimeVersion, Updates.manifest));

/** The release number of the running code, for the What to test list. "dev" in development. */
export const RELEASE = displayVersion(Updates.runtimeVersion, Updates.manifest) ?? 'dev';

/** The update channel this APK listens to ("production"), or null in Expo Go and dev builds. */
export const UPDATE_CHANNEL: string | null = Updates.channel ?? null;
