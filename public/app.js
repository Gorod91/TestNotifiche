const $ = (id) => document.getElementById(id);
const log = (msg) => { $('log').textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + $('log').textContent; };

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration;
let hasServer = false; // false su hosting statico (GitHub Pages)

// La chiave VAPID arriva in base64url, PushManager la vuole come Uint8Array.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function api(path, body) {
  const res = await fetch(path.replace(/^\//, ''), {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refreshStatus() {
  $('st-standalone').textContent = isStandalone ? 'sì' : 'no';
  $('st-push').textContent = pushSupported ? 'sì' : 'no';
  $('st-perm').textContent = 'Notification' in window ? Notification.permission : 'n/d';
  $('st-sw').textContent = registration ? 'attivo' : 'no';
  const sub = registration && (await registration.pushManager.getSubscription());
  $('st-sub').textContent = sub ? 'sì' : 'no';
  $('btn-enable').hidden = !!sub;
  $('btn-disable').hidden = !sub;
  $('install-hint').hidden = !(isIOS && !isStandalone);
  $('server-tools').hidden = !hasServer;
  $('static-tools').hidden = hasServer;
  $('sub-json').value = sub ? JSON.stringify(sub) : '';
}

async function getVapidKey() {
  if (hasServer) return (await api('/api/vapid-public-key')).publicKey;
  return window.APP_CONFIG.vapidPublicKey;
}

async function enable() {
  try {
    if (!pushSupported) {
      throw new Error(isIOS && !isStandalone
        ? 'Aggiungi prima l\'app alla schermata Home e aprila da lì.'
        : 'Questo browser non supporta le notifiche push.');
    }
    // Su iOS va chiamato direttamente dentro un gesto dell'utente (tap).
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(`Permesso: ${permission}`);

    const publicKey = await getVapidKey();
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    if (hasServer) {
      const r = await api('/api/subscribe', sub.toJSON());
      log(`Iscritto ✅ (dispositivi registrati: ${r.total})`);
    } else {
      log('Iscritto ✅ Copia la sottoscrizione qui sotto nel secret PUSH_SUBSCRIPTION.');
    }
  } catch (err) {
    log(`Errore: ${err.message}`);
  }
  refreshStatus();
}

async function disable() {
  const sub = await registration.pushManager.getSubscription();
  if (sub) {
    if (hasServer) await api('/api/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
    log('Disiscritto');
  }
  refreshStatus();
}

async function localNotification() {
  try {
    if (Notification.permission !== 'granted') throw new Error('Attiva prima le notifiche');
    // Su iOS non esiste `new Notification()`: si passa sempre dal service worker.
    await registration.showNotification($('in-title').value, { body: $('in-body').value, icon: 'icons/icon-192.png' });
    log('Notifica locale mostrata');
  } catch (err) {
    log(`Errore: ${err.message}`);
  }
}

async function serverPush(delay) {
  try {
    const r = await api('/api/send', { title: $('in-title').value, body: $('in-body').value, delay });
    log(delay ? `Push programmato tra ${r.delay}s` : `Push inviato: ${r.sent} ok, ${r.failed} falliti`);
  } catch (err) {
    log(`Errore: ${err.message}`);
  }
}

$('btn-enable').addEventListener('click', enable);
$('btn-disable').addEventListener('click', disable);
$('btn-local').addEventListener('click', localNotification);
$('btn-push').addEventListener('click', () => serverPush(0));
$('btn-push-delay').addEventListener('click', () => serverPush(10));
$('btn-copy').addEventListener('click', async () => {
  const text = $('sub-json').value;
  if (!text) return log('Attiva prima le notifiche');
  try {
    await navigator.clipboard.writeText(text);
    log('Sottoscrizione copiata 📋');
  } catch {
    $('sub-json').select();
    log('Copia non riuscita: seleziona il testo e copialo a mano');
  }
});

(async () => {
  try {
    await api('/api/status');
    hasServer = true;
  } catch {
    hasServer = false;
  }
  if ('serviceWorker' in navigator) {
    try {
      registration = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
    } catch (err) {
      log(`Service worker non registrato: ${err.message}`);
    }
  }
  refreshStatus();
})();
