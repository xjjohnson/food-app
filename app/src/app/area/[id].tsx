import { useLocalSearchParams } from 'expo-router';
import { SignedIn } from '../../components/SignedIn';
import { AreaScreen } from '../../screens/AreaScreen';

export default function Area() {
  const { id, go } = useLocalSearchParams<{ id: string; go?: string }>();
  return (
    <SignedIn>
      <AreaScreen id={String(id)} go={go ? String(go) : undefined} />
    </SignedIn>
  );
}
