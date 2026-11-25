import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Política de segurança: a janela só pode falar com o Supabase e o IBGE.
// Aplicada apenas na versão final (o modo de desenvolvimento precisa de scripts embutidos).
const csp =
  "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://servicodados.ibge.gov.br; " +
  "img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:";

const politicaSeguranca = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

export default defineConfig({
  plugins: [react(), politicaSeguranca()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
