import path from 'path';
import react from '@vitejs/plugin-react';
import { ViteMcp } from 'vite-plugin-mcp';
import { defineConfig } from 'vite';
import { chatGPTWidgetPlugin } from 'vite-plugin-chatgpt-widgets';

import { setupMcpServer } from './src/mcp';

export default defineConfig({
  plugins: [
    react(),
    chatGPTWidgetPlugin({
      widgetsDir: 'src/chatgpt-widgets',
      baseUrl: 'http://localhost:5173',
    }),
    ViteMcp({
      mcpServerSetup: setupMcpServer,
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
