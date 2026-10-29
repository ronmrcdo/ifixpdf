import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({build:{rollupOptions:{input:{editor:resolve('index.html'),library:resolve('library.html'),desk:resolve('desk.html')},output:{manualChunks:{'pdf-engine':['pdf-lib','pdfjs-dist']}}}}});
