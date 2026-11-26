/**
 * Hands a small text file (CSV) to the phone's share sheet, so it can go to
 * email, Drive or a printer app. Uses expo-file-system and expo-sharing, both
 * already in the APK. Tests replace this file (jest.setup.js).
 */
export async function shareText(fileName: string, text: string, mime = 'text/csv'): Promise<void> {
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const f = new File(Paths.cache, fileName);
  if (f.exists) f.delete();
  f.create();
  await f.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot share files from here.');
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: fileName });
}
