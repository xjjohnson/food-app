import { SignedIn } from '../../components/SignedIn';
import { MakeBatchesScreen } from '../../screens/MakePages';

export default function MakeBatches() {
  return (
    <SignedIn>
      <MakeBatchesScreen />
    </SignedIn>
  );
}
