import { SignedIn } from '../../components/SignedIn';
import { MakeJarsScreen } from '../../screens/MakePages';

export default function MakeJars() {
  return (
    <SignedIn>
      <MakeJarsScreen />
    </SignedIn>
  );
}
