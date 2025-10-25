import path from 'path';
import react from '@vitejs/plugin-react';
import { chatGPTWidgetPlugin } from 'vite-plugin-chatgpt-widgets';
import { ViteMcp } from './plugins/vite-mcp';
import mcpServerSetup from './src/mcp';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    chatGPTWidgetPlugin({
      widgetsDir: 'src/chatgpt-widgets',
      baseUrl: 'http://localhost:5173',
    }),
    ViteMcp({
      mcpServerSetup,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
