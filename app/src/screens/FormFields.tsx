import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Field, Row, Screen, Segments, SwitchRow } from '../components/ui';
import type { Draft, FieldDef, Rel, Section, Val } from '../lib/odooForm';
import { COLOR_NAMES, ODOO_COLORS, searchRelation } from '../lib/odooForm';
import { useOdoo } from '../lib/useOdoo';

/** Picks from an Odoo list by name: one record, or several for a "many" field. */
export function RelationPicker({ def, selected, onChange, onBack }: { def: FieldDef; selected: Val; onChange: (v: Val) => void; onBack: () => void }) {
  const { client, offline } = useOdoo();
  const [text, setText] = useState('');
  const [items, setItems] = useState<Rel[]>([]);
  const [error, setError] = useState('');
  const many = def.kind === 'many';
  const chosen = many ? (selected as Rel[]) : [];

  useEffect(() => {
    if (!client || offline) return;
    const t = setTimeout(() => {
      searchRelation(client, def.relation!, text, def.domain)
        .then(setItems)
        .catch((e) => setError(`Couldn’t read the list from Odoo. ${e instanceof Error ? e.message : String(e)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [client, offline, text, def]);

  return (
    <Screen title={def.label} testID="relation-picker">
      {offline ? <Body muted>No signal. Picking needs Odoo.</Body> : <Field label="Find" value={text} onChangeText={setText} testID="relation-search" />}
      {error ? <Body muted>{error}</Body> : null}
      {!many ? <Row title="None" onPress={() => { onChange(null); onBack(); }} testID="relation-none" /> : null}
      {items.map((i) => {
        const on = chosen.some((c) => c.id === i.id);
        return (
          <Row
            key={i.id}
            title={`${on ? '✓ ' : ''}${i.name}`}
            testID={`relation-${i.id}`}
            onPress={() => {
              if (!many) {
                onChange(i);
                onBack();
              } else onChange(on ? chosen.filter((c) => c.id !== i.id) : [...chosen, i]);
            }}
          />
        );
      })}
      {!items.length && !offline ? <Body muted>Nothing found.</Body> : null}
      <Button label={many ? 'Done' : 'Back'} kind="plain" onPress={onBack} testID="relation-done" />
    </Screen>
  );
}

/** The fields of one section, drawn by what each field is. */
export function FormFields({ section, draft, setValue, pick }: { section: Section; draft: Draft; setValue: (name: string, v: Val) => void; pick: (d: FieldDef) => void }) {
  return (
    <>
      {section.fields.map((d) => {
        if (d.showWhen && draft[d.showWhen] !== true) return null;
        const v = draft[d.name];
        const id = `f-${d.name}`;
        const hint = d.hint ? <Body muted>{d.hint}</Body> : null;
        if (d.kind === 'bool') return <SwitchRow key={d.name} title={d.label} detail={d.hint} value={v === true} onChange={(x) => setValue(d.name, x)} disabled={d.readOnly} testID={id} />;
        if (d.kind === 'color') {
          const cur = String(v === '' || v === undefined || v === null ? 0 : v);
          return (
            <Card key={d.name} title={`${d.label}: ${COLOR_NAMES[Number(cur)] ?? 'None'}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {ODOO_COLORS.map((hex, n) => (
                  <Pressable
                    key={n}
                    disabled={d.readOnly}
                    onPress={() => setValue(d.name, String(n))}
                    accessibilityRole="button"
                    accessibilityLabel={COLOR_NAMES[n]}
                    accessibilityState={{ selected: cur === String(n) }}
                    testID={`color-${n}`}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: hex, borderWidth: cur === String(n) ? 4 : 1, borderColor: cur === String(n) ? '#ffffff' : '#00000033', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {n === 0 ? <Text>–</Text> : null}
                  </Pressable>
                ))}
              </View>
            </Card>
          );
        }
        if (d.kind === 'select')
          return (
            <Card key={d.name} title={d.label}>
              <Segments options={d.options!} value={String(v || d.options![0]!.id)} onChange={(x) => setValue(d.name, x)} testID={id} />
            </Card>
          );
        if (d.kind === 'one')
          return <Row key={d.name} title={d.label} value={(v as Rel | null)?.name ?? 'None'} onPress={d.readOnly ? undefined : () => pick(d)} testID={id} />;
        if (d.kind === 'many') {
          const list = (v as Rel[]) ?? [];
          return (
            <Card key={d.name} title={d.label} testID={id}>
              {list.map((r) => (
                <Row key={r.id} title={r.name} right={d.readOnly ? undefined : <Body muted>Remove</Body>} onPress={d.readOnly ? undefined : () => setValue(d.name, list.filter((x) => x.id !== r.id))} testID={`${id}-${r.id}`} />
              ))}
              {!list.length ? <Body muted>None.</Body> : null}
              {d.readOnly ? null : <Button label="Add" kind="plain" onPress={() => pick(d)} testID={`${id}-add`} />}
              {hint}
            </Card>
          );
        }
        const multi = d.kind === 'long' || d.kind === 'html';
        return (
          <Field
            key={d.name}
            label={d.label}
            value={String(v ?? '')}
            onChangeText={(x) => setValue(d.name, x)}
            keyboardType={d.kind === 'num' ? 'decimal-pad' : d.kind === 'whole' ? 'number-pad' : 'default'}
            multiline={multi}
            editable={!d.readOnly}
            autoCapitalize={d.name === 'name' ? 'words' : 'none'}
            testID={id}
          />
        );
      })}
    </>
  );
}
