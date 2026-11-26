import { SignedIn } from '../components/SignedIn';
import { SearchScreen } from '../screens/SearchScreen';

export default function Search() {
  return (
    <SignedIn>
      <SearchScreen />
    </SignedIn>
  );
}
