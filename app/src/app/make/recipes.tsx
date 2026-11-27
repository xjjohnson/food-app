import { SignedIn } from '../../components/SignedIn';
import { MakeRecipesScreen } from '../../screens/MakePages';

export default function MakeRecipes() {
  return (
    <SignedIn>
      <MakeRecipesScreen />
    </SignedIn>
  );
}
