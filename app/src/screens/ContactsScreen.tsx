import { useInnerBack } from '../lib/innerBack';
import { useEffect, useState } from 'react';
import { Body, Button, ErrorText, Field, Row, Screen } from '../components/ui';
import { Contact, searchContacts } from '../lib/edit';
import { CONTACT_SECTIONS } from '../lib/forms';
import { useOdoo } from '../lib/useOdoo';
import { GenericForm } from './GenericForm';

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Customers and suppliers: search, add and change. */
export function ContactsScreen() {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [list, setList] = useState<Contact[]>([]);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<{ id?: number } | null>(null);
  const [error, setError] = useState('');
  useInnerBack(form ? () => { setForm(null); setTick((n) => n + 1); } : null);

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
      <GenericForm
        model="res.partner"
        recordId={form.id ?? null}
        title="Contact"
        noun="Contact"
        sections={CONTACT_SECTIONS}
        required={['name']}
        testID="contact-form"
        onBack={() => {
          setForm(null);
          setTick((n) => n + 1);
        }}
      />
    );

  return (
    <Screen title="Customers and suppliers" testID="contacts-screen">
      <Button label="Add a contact" onPress={() => setForm({})} testID="new-contact" />
      {offline ? <Body muted>No signal. The list comes from Odoo; you can still add a contact and it will be sent later.</Body> : <Field label="Search by name" value={text} onChangeText={setText} testID="contact-search" />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {list.map((c) => (
        <Row key={c.id} title={c.name} detail={[c.phone, c.email].filter(Boolean).join(' · ')} onPress={() => setForm({ id: c.id })} testID={`contact-${c.id}`} />
      ))}
    </Screen>
  );
}
