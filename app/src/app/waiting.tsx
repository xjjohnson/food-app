import { SignedIn } from '../components/SignedIn';
import { WaitingScreen } from '../screens/WaitingScreen';

export default function Waiting() {
  return (
    <SignedIn>
      <WaitingScreen />
    </SignedIn>
  );
}
