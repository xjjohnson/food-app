import { SignedIn } from '../components/SignedIn';
import { ContactsScreen } from '../screens/ContactsScreen';

export default function Contacts() {
  return (
    <SignedIn>
      <ContactsScreen />
    </SignedIn>
  );
}
