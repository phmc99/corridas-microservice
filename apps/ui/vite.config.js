import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento (npm run dev), /api vai para a API local.
// No Docker, quem faz esse papel é o nginx (nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
    },
  },
});
