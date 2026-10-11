// Server minimale: serve la PWA e invia notifiche Web Push (VAPID).
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const VAPID_FILE = path.join(__dirname, 'vapid.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

// Chiavi VAPID: da variabili d'ambiente, altrimenti generate e salvate su file.
let vapid;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (fs.existsSync(VAPID_FILE)) {
  vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid, null, 2));
  console.log('Generate nuove chiavi VAPID in vapid.json');
}
// Apple richiede un subject valido (mailto: o https:).
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:test@example.com', vapid.publicKey, vapid.privateKey);

let subscriptions = fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : [];
const saveSubs = () => fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function sendToAll(payload) {
  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
  );
  // Rimuove le sottoscrizioni scadute o revocate.
  const expired = new Set();
  results.forEach((r, i) => {
    if (r.status === 'rejected' && [404, 410].includes(r.reason.statusCode)) expired.add(subscriptions[i].endpoint);
    if (r.status === 'rejected') console.error('Invio fallito:', r.reason.statusCode, r.reason.body);
  });
  if (expired.size) {
    subscriptions = subscriptions.filter((s) => !expired.has(s.endpoint));
    saveSubs();
  }
  return { sent: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/vapid-public-key') {
      return sendJson(res, 200, { publicKey: vapid.publicKey });
    }

    if (req.method === 'POST' && url.pathname === '/api/subscribe') {
      const sub = await readBody(req);
      if (!sub || !sub.endpoint) return sendJson(res, 400, { error: 'Sottoscrizione non valida' });
      if (!subscriptions.some((s) => s.endpoint === sub.endpoint)) {
        subscriptions.push(sub);
        saveSubs();
      }
      return sendJson(res, 201, { ok: true, total: subscriptions.length });
    }

    if (req.method === 'POST' && url.pathname === '/api/unsubscribe') {
      const { endpoint } = await readBody(req);
      subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
      saveSubs();
      return sendJson(res, 200, { ok: true, total: subscriptions.length });
    }

    if (req.method === 'POST' && url.pathname === '/api/send') {
      const { title, body, delay } = await readBody(req);
      const payload = { title: title || 'Test notifica', body: body || 'Ciao dal server! 👋', url: '/' };
      const seconds = Math.min(Math.max(Number(delay) || 0, 0), 60);
      if (seconds > 0) {
        // Utile per testare con l'app chiusa o il telefono bloccato.
        setTimeout(() => sendToAll(payload).then((r) => console.log('Invio ritardato:', r)), seconds * 1000);
        return sendJson(res, 202, { scheduled: true, delay: seconds, total: subscriptions.length });
      }
      return sendJson(res, 200, await sendToAll(payload));
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, { subscriptions: subscriptions.length });
    }

    // File statici
    if (req.method === 'GET') {
      const filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
      if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Vietato' });
      return fs.readFile(filePath, (err, data) => {
        if (err) return sendJson(res, 404, { error: 'Non trovato' });
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    }

    sendJson(res, 404, { error: 'Non trovato' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));
