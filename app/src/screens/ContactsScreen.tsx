import { useEffect, useState } from 'react';
import { Body, Button, ErrorText, Field, Row, Screen } from '../components/ui';
import { Contact, editContactChange, newContactChange, searchContacts } from '../lib/edit';
import { useOdoo } from '../lib/useOdoo';
import { useQueue } from '../lib/useQueue';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Customers and suppliers: search, add and change. */
export function ContactsScreen() {
  const { client, offline } = useOdoo();
  const { save } = useQueue();
  const [text, setText] = useState('');
  const [list, setList] = useState<Contact[]>([]);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<{ id?: number; name: string; phone: string; email: string } | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchContacts(client, text)
        .then(setList)
        .catch((e) => setError(`Couldn’t read contacts from Odoo. ${why(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, tick]);

  if (form)
    return (
      <Screen title={form.id ? 'Change contact' : 'New contact'} testID="contact-form">
        <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} autoCapitalize="words" testID="contact-name" />
        <Field label="Phone" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" testID="contact-phone" />
        <Field label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" testID="contact-email" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {note ? <Body>{note}</Body> : null}
        <Button
          label="Save"
          disabled={!form.name.trim() || !!note}
          testID="save-contact"
          onPress={async () => {
            setError('');
            try {
              const r = await save(form.id ? editContactChange(form.id, form) : newContactChange(form));
              setNote(r.status === 'queued' ? 'Saved on the phone. It goes to Odoo when signal is back.' : 'Saved in Odoo.');
              setTimeout(() => {
                setForm(null);
                setNote('');
                setTick((n) => n + 1);
              }, 900);
            } catch (e) {
              setError(`Odoo said no: ${why(e)}`);
            }
          }}
        />
        <Button label="Back" kind="plain" onPress={() => setForm(null)} />
      </Screen>
    );

  return (
    <Screen title="Customers and suppliers" testID="contacts-screen">
      <Button label="Add a contact" onPress={() => setForm({ name: '', phone: '', email: '' })} testID="new-contact" />
      {offline ? <Body muted>No signal. The list comes from Odoo; you can still add a contact and it will be sent later.</Body> : <Field label="Search by name" value={text} onChangeText={setText} testID="contact-search" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list.map((c) => (
        <Row key={c.id} title={c.name} detail={[c.phone, c.email].filter(Boolean).join(' · ')} onPress={() => setForm({ id: c.id, name: c.name, phone: c.phone, email: c.email })} testID={`contact-${c.id}`} />
      ))}
    </Screen>
  );
}
