import {readdirSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';

// pdf.js loads CMaps and standard fonts by URL at render time, so they ship as plain files under /pdfjs/.
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const PDFJS_DIRS = ['cmaps', 'standard_fonts'];

function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const [dir, file] = (req.url ?? '').split('?')[0]?.slice(1).split('/') ?? [];
        if (!dir || !file || !PDFJS_DIRS.includes(dir) || file.includes('..')) return next();
        try {
          res.end(readFileSync(join(PDFJS_ROOT, dir, file)));
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const dir of PDFJS_DIRS) {
        for (const file of readdirSync(join(PDFJS_ROOT, dir))) {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${file}`,
            source: readFileSync(join(PDFJS_ROOT, dir, file)),
          });
        }
      }
    },
  };
}

export default defineConfig({plugins: [react(), pdfjsAssets()]});
