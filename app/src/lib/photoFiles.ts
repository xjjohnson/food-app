/**
 * Photos taken on the phone wait as plain files in the app's own folder (expo-file-system,
 * already in the APK) until Odoo has them. Only the file's path goes in the offline queue:
 * the queue is one small saved value, and a photo as text in it would break it.
 * Tests replace this file with an in-memory one (jest.setup.js).
 */
const fs = () => require('expo-file-system') as typeof import('expo-file-system');

/** Copies a fresh camera picture into the app's folder and returns where it now is. */
export async function keepPhoto(uri: string): Promise<string> {
  const { File, Paths } = fs();
  const target = new File(Paths.document, `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`);
  new File(uri).copy(target);
  return target.uri;
}

/** The picture as base64 text for Odoo, or null if the file is gone. */
export async function readPhoto(uri: string): Promise<string | null> {
  const { File } = fs();
  const f = new File(uri);
  return f.exists ? await f.base64() : null;
}

/** Removes the file once Odoo has it. Never throws. */
export async function dropPhoto(uri: string): Promise<void> {
  try {
    const { File } = fs();
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
