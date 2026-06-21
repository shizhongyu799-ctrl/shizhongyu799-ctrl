const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BACKEND = 'http://localhost:3000';
const DIST_DIR = path.join(__dirname, 'frontend', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

function pipeToBackend(req, res) {
  const targetUrl = BACKEND + req.url;
  const target = new URL(targetUrl);

  const opts = {
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: target.host })
  };

  const client = (target.protocol === 'https:' ? https : http).request(opts, (upstream) => {
    res.writeHead(upstream.statusCode || 500, upstream.headers);
    upstream.pipe(res);
  });

  client.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '后端未启动: ' + err.message }));
  });

  req.pipe(client);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // 防止路径穿越
  const safePath = path.normalize(path.join(DIST_DIR, urlPath));
  if (!safePath.startsWith(DIST_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA 回退到 index.html
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (e, data) => {
        if (e) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url === '/api') {
    pipeToBackend(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[CRM] 统一入口服务已启动，监听端口 ' + PORT);
  console.log('[CRM] 静态资源目录: ' + DIST_DIR);
  console.log('[CRM] 后端反代: ' + BACKEND);
  console.log('[CRM] 请通过局域网 IP 访问，例如: http://<你的局域网IP>:' + PORT);
});

server.on('error', (err) => {
  console.error('[CRM] 服务错误:', err.message);
});
