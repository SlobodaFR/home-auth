import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/authorize': 'http://localhost:3000',
      '/token': 'http://localhost:3000',
      '/userinfo': 'http://localhost:3000',
      '/profile': 'http://localhost:3000',
      '/avatars': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
    },
  },
});
