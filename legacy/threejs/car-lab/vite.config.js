// Nur für den Showroom: POST /__shot?name=x legt ein JPG in renders/web/ ab.
// Die eingebettete Vorschau kann keine Bildschirmfotos — so kommt das Bild
// aus dem WebGL-Puffer trotzdem auf die Platte (wie japanMap.shot() im Spiel).
import fs from 'node:fs';
import path from 'node:path';

export default {
  server: { fs: { allow: ['..'] } },
  plugins: [{
    name: 'carlab-shot',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const dir = path.join(import.meta.dirname, 'renders', 'web');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name + '.jpg'), Buffer.from(body.split(',')[1] || '', 'base64'));
          res.end('ok');
        });
      });
    },
  }],
};
