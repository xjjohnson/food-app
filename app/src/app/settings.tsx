import { SignedIn } from '../components/SignedIn';
import { SettingsScreen } from '../screens/SettingsScreen';

export default function Settings() {
  return (
    <SignedIn>
      <SettingsScreen />
    </SignedIn>
  );
}
