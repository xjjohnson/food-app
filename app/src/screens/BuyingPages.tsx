import { useEffect, useState } from 'react';
import { Linking, Modal, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Row, Screen } from '../components/ui';
import { CodeMatch, findByCode, loadReadings, loadScorecard, loadVehicles, Reading, readingChange, readingProblems, Scorecard, Vehicle } from '../lib/buying';
import { useInnerBack } from '../lib/innerBack';
import { mapLink } from '../lib/deliveryBoard';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';
import { useRoles } from '../lib/useRoles';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Supplier page: Call, Open map, and a scorecard of orders, on-time deliveries and price changes. */
export function SupplierBox({ partnerId, name }: { partnerId: number; name: string }) {
  const { client, offline } = useOdoo();
  const [info, setInfo] = useState<{ phone: string; address: string } | null>(null);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client || offline) return;
    (async () => {
      const [p] = (await client.call('res.partner', 'read', [[partnerId]], { fields: ['phone', 'mobile', 'street', 'city', 'zip'] })) as Record<string, unknown>[];
      const s = (k: string) => (typeof p?.[k] === 'string' ? (p![k] as string) : '');
      setInfo({ phone: s('mobile') || s('phone'), address: [s('street'), s('city'), s('zip')].filter(Boolean).join(', ') });
    })().catch(() => undefined);
  }, [client, offline, partnerId]);
  const show = async () => {
    if (!client) return;
    setError('');
    try {
      setCard(await loadScorecard(client, partnerId));
    } catch (e) {
      setError(`Couldn’t read the orders. ${why(e)}`);
    }
  };
  return (
    <Card title={`${name}: call and scorecard`} testID="supplier-box">
      {info?.phone ? <Button label={`Call ${info.phone}`} onPress={() => Linking.openURL(`tel:${info.phone}`)} testID="supplier-call" /> : <Body muted>No phone on the contact.</Body>}
      {info?.address ? <Button label="Open map" kind="plain" onPress={() => Linking.openURL(mapLink(info.address))} testID="supplier-map" /> : null}
      <Button label="Show scorecard" kind="plain" onPress={show} disabled={offline} testID="supplier-score" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {card ? (
        <>
          <Body>{`${card.orders} orders. On time: ${card.onTime}. Late: ${card.late}.`}</Body>
          {card.lastDeliveries.map((d) => (
            <Row key={d.order} title={d.order} detail={`Due ${d.planned || 'no date'} · came ${d.done} · ${d.onTime ? 'on time' : 'late'}`} />
          ))}
          {card.priceChanges.map((p) => (
            <Row key={p.product} title={p.product} detail={`Price went from ${p.from} to ${p.to}`} />
          ))}
          {!card.priceChanges.length ? <Body muted>No price changes between the last two orders.</Body> : null}
        </>
      ) : null}
    </Card>
  );
}

/** A camera that reads one barcode or QR code, then closes. Loaded only when opened. */
function ScanSheet({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const cam = require('expo-camera') as typeof import('expo-camera');
  const [perm, ask] = cam.useCameraPermissions();
  const [done, setDone] = useState(false);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000', padding: 12, justifyContent: 'flex-end' }}>
        {perm && !perm.granted ? (
          <View>
            <Body>The app needs the camera to scan a code.</Body>
            <Button label="Allow the camera" onPress={() => ask()} testID="scan-allow" />
          </View>
        ) : null}
        {perm?.granted ? (
          <cam.CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
            onBarcodeScanned={(r) => {
              if (done) return;
              setDone(true);
              onCode(r.data);
            }}
          />
        ) : null}
        <Button label="Cancel" kind="plain" onPress={onClose} testID="scan-cancel" />
      </View>
    </Modal>
  );
}

/** "Scan a code" button. A scanned product barcode or batch number is looked up in Odoo; nothing is changed. */
export function ScanButton({ onMatch, label = 'Scan a code' }: { onMatch: (m: NonNullable<CodeMatch>, code: string) => void; label?: string }) {
  const { client, offline } = useOdoo();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const got = async (code: string) => {
    setOpen(false);
    setMsg('');
    if (!client) return;
    try {
      const m = await findByCode(client, code);
      if (m) onMatch(m, code);
      else setMsg(`Nothing in Odoo has the code ${code}.`);
    } catch (e) {
      setMsg(`Couldn’t look it up. ${why(e)}`);
    }
  };
  return (
    <>
      <Button label={label} kind="plain" onPress={() => setOpen(true)} disabled={offline} testID="scan-button" />
      {msg ? <Body>{msg}</Body> : null}
      {open ? <ScanSheet onCode={got} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Mileage with the free Fleet app: pick a vehicle and save the odometer. Owner only. */
export function MileageScreen() {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const { roles } = useRoles();
  const [cars, setCars] = useState<Vehicle[] | null | undefined>(undefined);
  const [car, setCar] = useState<Vehicle | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState('');
  useInnerBack(car ? () => setCar(null) : null);
  useEffect(() => {
    if (client && !offline) loadVehicles(client).then(setCars);
  }, [client, offline]);
  useEffect(() => {
    if (client && car) loadReadings(client, car.id).then(setReadings).catch(() => setReadings([]));
  }, [client, car, msg]);
  if (!roles.owner)
    return (
      <Screen title="Mileage">
        <Body>Only the owner can open this.</Body>
      </Screen>
    );
  if (cars === null)
    return (
      <Screen title="Mileage" testID="mileage-screen">
        <Body>Odoo’s free Fleet app isn’t installed yet. Install it in Odoo (Apps, Fleet), add the vehicle, then come back.</Body>
      </Screen>
    );
  if (!car)
    return (
      <Screen title="Mileage" testID="mileage-screen">
        {offline ? <Body muted>No signal. Vehicles come from Odoo.</Body> : null}
        {cars && !cars.length ? <Body muted>No vehicles yet. Add one in Odoo, Fleet.</Body> : null}
        {(cars ?? []).map((v) => (
          <Row key={v.id} title={v.name} detail={`Odometer ${v.odometer}`} onPress={() => setCar(v)} testID={`vehicle-${v.id}`} />
        ))}
      </Screen>
    );
  const last = readings[0]?.value;
  const go = async () => {
    const probs = readingProblems(value, date, last);
    if (probs.length) return setMsg(probs.join(' '));
    try {
      const r = await save(readingChange(car, Number(value.replace(',', '.')), date.trim()));
      setValue('');
      setMsg(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
    } catch (e) {
      setMsg(`Odoo said no: ${why(e)}`);
    }
  };
  return (
    <Screen title={car.name} testID="mileage-car">
      <Field label="Odometer reading" value={value} onChangeText={setValue} keyboardType="decimal-pad" testID="odo-value" />
      <Field label="Date (2026-12-05)" value={date} onChangeText={setDate} testID="odo-date" />
      <Button label="Save reading" onPress={go} testID="odo-save" />
      {msg ? <Body>{msg}</Body> : null}
      {readings.map((r, i) => (
        <Row key={r.id} title={`${r.value}`} detail={`${r.date}${readings[i + 1] ? ` · ${Math.round((r.value - readings[i + 1]!.value) * 10) / 10} since the one before` : ''}`} />
      ))}
    </Screen>
  );
}
