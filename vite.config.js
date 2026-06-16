import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // La logique métier (comptabilité, formatage) est testée en pur Node, pas besoin de DOM.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
