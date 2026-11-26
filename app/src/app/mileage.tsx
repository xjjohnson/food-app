import { SignedIn } from '../components/SignedIn';
import { MileageScreen } from '../screens/BuyingPages';

export default function Mileage() {
  return (
    <SignedIn>
      <MileageScreen />
    </SignedIn>
  );
}
