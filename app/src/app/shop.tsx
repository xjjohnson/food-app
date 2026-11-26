import { SignedIn } from '../components/SignedIn';
import { ShopScreen } from '../screens/ShopScreen';

export default function Shop() {
  return (
    <SignedIn>
      <ShopScreen />
    </SignedIn>
  );
}
