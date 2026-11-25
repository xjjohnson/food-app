import { SignedIn } from '../components/SignedIn';
import { ManagementScreen } from '../screens/ManagementScreen';

export default function Management() {
  return (
    <SignedIn>
      <ManagementScreen />
    </SignedIn>
  );
}
