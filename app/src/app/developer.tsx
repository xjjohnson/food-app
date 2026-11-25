import { DeveloperScreen } from '../screens/DeveloperScreen';

/** Works signed in or out, so the test database can be attached before the first sign-in. */
export default function Developer() {
  return <DeveloperScreen />;
}
