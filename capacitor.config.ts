import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neonserpent.game',
  appName: 'Neon Serpent',
  webDir: 'dist',
  backgroundColor: '#07060f',
  android: {
    backgroundColor: '#07060f',
  },
  ios: {
    backgroundColor: '#07060f',
    contentInset: 'never',
  },
};

export default config;
