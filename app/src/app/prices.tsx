import { SignedIn } from '../components/SignedIn';
import { PricesScreen } from '../screens/PricesScreen';

export default function Prices() {
  return (
    <SignedIn>
      <PricesScreen />
    </SignedIn>
  );
}
