import { SignedIn } from '../components/SignedIn';
import { LookupScreen } from '../screens/LookupScreen';

export default function Lookup() {
  return (
    <SignedIn>
      <LookupScreen />
    </SignedIn>
  );
}
