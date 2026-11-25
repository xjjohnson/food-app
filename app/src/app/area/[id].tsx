import { useLocalSearchParams } from 'expo-router';
import { SignedIn } from '../../components/SignedIn';
import { AreaScreen } from '../../screens/AreaScreen';

export default function Area() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SignedIn>
      <AreaScreen id={String(id)} />
    </SignedIn>
  );
}
