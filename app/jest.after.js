// Every test starts from an empty phone: no saved data, no keys, testing switches off.
beforeEach(async () => {
  require('./src/lib/secrets').__store.clear();
  require('./src/lib/dbSnapshots').__files.clear();
  await require('@react-native-async-storage/async-storage').clear();
  require('./src/lib/devFlags').resetDevFlags();
});
