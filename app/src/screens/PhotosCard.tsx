import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, View } from 'react-native';
import { Body, Button, Card, ErrorText } from '../components/ui';
import { keepPhoto } from '../lib/photoFiles';
import { Photo, loadPhotos, photoChange } from '../lib/photos';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The camera, full screen. expo-camera is already in the app; it is loaded only when this
 * opens, so screens that never take a photo don't need it.
 */
function CameraSheet({ onTaken, onClose }: { onTaken: (uri: string) => void; onClose: () => void }) {
  const cam = require('expo-camera') as typeof import('expo-camera');
  const [perm, ask] = cam.useCameraPermissions();
  const [ref, setRef] = useState<InstanceType<typeof cam.CameraView> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000', padding: 12, justifyContent: 'flex-end' }}>
        {!perm ? <Body>Checking the camera…</Body> : null}
        {perm && !perm.granted ? (
          <View>
            <Body>The app needs the camera to take a photo.</Body>
            <Button label="Allow the camera" onPress={() => ask()} testID="photo-allow" />
          </View>
        ) : null}
        {perm?.granted ? <cam.CameraView ref={setRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {perm?.granted ? (
          <Button
            label="Take photo"
            disabled={!ready}
            testID="photo-shutter"
            onPress={async () => {
              try {
                const shot = await ref?.takePictureAsync({ quality: 0.5, skipProcessing: false });
                if (shot?.uri) onTaken(shot.uri);
              } catch (e) {
                setError(`The camera would not take it. ${why(e)}`);
              }
            }}
          />
        ) : null}
        <Button label="Cancel" kind="plain" onPress={onClose} testID="photo-cancel" />
      </View>
    </Modal>
  );
}

/**
 * Photos on a record in Odoo, newest first, with a button to take one. The picture waits on
 * the phone and goes to Odoo through the queue, so it works without signal.
 */
export function PhotosCard({ model, resId, recordName, title = 'Photos', about = 'Photo', button = 'Take a photo', testID = 'photos-card' }: { model: string; resId: number; recordName: string; title?: string; about?: string; button?: string; testID?: string }) {
  const { client, offline } = useOdoo();
  const { save, items } = useQueue();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!client || offline || !resId) return;
    try {
      setPhotos(await loadPhotos(client, model, resId));
    } catch (e) {
      setError(`Couldn’t read the photos. ${why(e)}`);
    }
  }, [client, offline, model, resId]);

  useEffect(() => {
    load();
  }, [load]);

  const waiting = items.filter((i) => i.step?.kind === 'photo' && (i.step as { resId: number; model: string }).resId === resId && (i.step as { model: string }).model === model).length;

  const taken = async (uri: string) => {
    setOpen(false);
    setError('');
    try {
      const kept = await keepPhoto(uri);
      await save(photoChange(model, resId, about, kept, recordName));
      await load();
    } catch (e) {
      setError(`Couldn’t keep the photo. ${why(e)}`);
    }
  };

  return (
    <Card title={title} testID={testID}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {waiting ? <Body muted>{`${waiting} photo${waiting === 1 ? '' : 's'} saved on the phone, waiting for signal.`}</Body> : null}
      {offline && !photos ? <Body muted>No signal. Saved photos show when the phone is back online.</Body> : null}
      {photos && !photos.length && !waiting ? <Body muted>No photos yet.</Body> : null}
      {photos?.map((p) => (
        <View key={p.id} style={{ marginBottom: 10 }} testID={`photo-${p.id}`}>
          <Body muted>{`${p.about} · ${p.when}`}</Body>
          {p.data ? <Image source={{ uri: `data:image/jpeg;base64,${p.data}` }} style={{ width: '100%', height: 200, borderRadius: 8 }} resizeMode="cover" /> : null}
        </View>
      ))}
      <Button label={button} onPress={() => setOpen(true)} testID="photo-take" />
      {open ? <CameraSheet onTaken={taken} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
