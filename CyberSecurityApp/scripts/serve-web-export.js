#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8082);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isInsideRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function existingFile(filePath) {
  if (!isInsideRoot(filePath)) {
    return null;
  }

  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function dynamicRouteFile(pathname) {
  const segments = pathname.split('/').filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const directory = path.join(root, ...segments.slice(0, index));

    try {
      const entries = fs.readdirSync(directory);
      const dynamicHtml = entries.find((entry) => /^\[[^\]]+\]\.html$/.test(entry));

      if (dynamicHtml) {
        return existingFile(path.join(directory, dynamicHtml));
      }
    } catch {
      return null;
    }
  }

  return null;
}

function resolveRoute(requestUrl) {
  const { pathname } = new URL(requestUrl, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = decodedPath === '/' ? '/index' : decodedPath.replace(/\/$/, '');
  const exactPath = path.join(root, normalizedPath);

  return (
    existingFile(exactPath) ||
    existingFile(`${exactPath}.html`) ||
    existingFile(path.join(exactPath, 'index.html')) ||
    dynamicRouteFile(normalizedPath) ||
    existingFile(path.join(root, '+not-found.html')) ||
    existingFile(path.join(root, 'index.html'))
  );
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  const filePath = resolveRoute(request.url || '/');

  if (!filePath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
  };

  response.writeHead(200, headers);

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT=8083 npm run serve:web to use another port.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Serving Expo web export from ${root}`);
  console.log(`Open http://${host}:${port}`);
});
