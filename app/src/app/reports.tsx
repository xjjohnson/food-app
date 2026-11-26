import { SignedIn } from '../components/SignedIn';
import { ReportsScreen } from '../screens/ReportsScreen';

export default function Reports() {
  return (
    <SignedIn>
      <ReportsScreen />
    </SignedIn>
  );
}
