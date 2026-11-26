import { SignedIn } from '../components/SignedIn';
import { TasksScreen } from '../screens/TasksScreen';

export default function Tasks() {
  return (
    <SignedIn>
      <TasksScreen />
    </SignedIn>
  );
}
