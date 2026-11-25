import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Screen } from '../components/ui';
import { guessDb } from '../lib/odoo';
import { useBrand } from '../lib/useBrand';
import { useOdoo } from '../lib/useOdoo';

/**
 * Sign in to Odoo with an email and an API key (or password). The key is
 * kept in the phone's keystore, never in the app's files or backups. To use
 * the test database, use the Developer screen (the button under the form).
 */
export function SignInScreen() {
  const { saved, error, signIn, status } = useOdoo();
  const { name } = useBrand();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [db, setDb] = useState(saved?.db ?? '');
  const [login, setLogin] = useState(saved?.login ?? '');
  const [secret, setSecret] = useState('');

  useEffect(() => {
    if (saved) {
      setUrl(saved.url);
      setDb(saved.db);
      setLogin(saved.login);
    }
  }, [saved]);

  const busy = status === 'signingIn';
  return (
    <Screen title={name} back={false} testID="sign-in-screen">
      <Card title="Sign in to Odoo">
        <Body muted>Use your Odoo email and an API key. Make a key in Odoo: your picture, My Preferences, Account Security, New API Key.</Body>
        <Field label="Odoo address" value={url} onChangeText={(t) => { setUrl(t); if (!db) setDb(guessDb(t)); }} placeholder="food.example.com" keyboardType="url" testID="signin-url" />
        <Field label="Database" value={db} onChangeText={setDb} testID="signin-db" />
        <Field label="Email" value={login} onChangeText={setLogin} keyboardType="email-address" testID="signin-login" />
        <Field label="API key or password" value={secret} onChangeText={setSecret} secureTextEntry testID="signin-secret" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Sign in" busy={busy} onPress={() => signIn({ url, db, login }, secret).then((ok) => ok && setSecret(''))} testID="signin-go" />
      </Card>
      <Button label="Developer: test database and testing tools" kind="plain" onPress={() => router.push('/developer')} testID="open-developer" />
    </Screen>
  );
}
