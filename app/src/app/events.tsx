import { SignedIn } from '../components/SignedIn';
import { EventsScreen } from '../screens/MakingPages';

export default function Events() {
  return (
    <SignedIn>
      <EventsScreen />
    </SignedIn>
  );
}
