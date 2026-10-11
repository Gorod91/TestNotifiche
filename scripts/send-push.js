// Invia una notifica push alle sottoscrizioni passate via variabile d'ambiente.
// Usato dalla GitHub Action "Invia notifica push" (nessun server necessario).
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const { VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, VAPID_SUBJECT, TITLE, BODY } = process.env;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!VAPID_PRIVATE_KEY) fail('Manca il secret VAPID_PRIVATE_KEY');
if (!PUSH_SUBSCRIPTION) fail('Manca il secret PUSH_SUBSCRIPTION (copialo dalla web app)');

// La chiave pubblica è quella pubblicata nella web app.
const config = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
const publicKey = process.env.VAPID_PUBLIC_KEY || (config.match(/vapidPublicKey:\s*'([^']+)'/) || [])[1];
if (!publicKey) fail('Chiave pubblica VAPID non trovata in public/config.js');

let subscriptions;
try {
  const parsed = JSON.parse(PUSH_SUBSCRIPTION);
  subscriptions = Array.isArray(parsed) ? parsed : [parsed];
} catch {
  fail('PUSH_SUBSCRIPTION non è un JSON valido');
}

try {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:test@example.com', publicKey, VAPID_PRIVATE_KEY.trim());
} catch (err) {
  fail(`Chiavi VAPID non valide: ${err.message}`);
}

const payload = JSON.stringify({ title: TITLE || 'Test notifica', body: BODY || 'Ciao da GitHub! 👋' });

(async () => {
  let ok = 0;
  for (const sub of subscriptions) {
    try {
      const res = await webpush.sendNotification(sub, payload);
      console.log(`Inviata (HTTP ${res.statusCode})`);
      ok++;
    } catch (err) {
      console.error(`::warning::Invio fallito (HTTP ${err.statusCode}): ${err.body || err.message}`);
      if ([404, 410].includes(err.statusCode)) console.error('La sottoscrizione è scaduta: riattiva le notifiche nella app e aggiorna il secret.');
    }
  }
  console.log(`Inviate ${ok}/${subscriptions.length}`);
  if (ok === 0) process.exit(1);
})();
