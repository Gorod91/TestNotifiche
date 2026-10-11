# Test Notifiche 🔔

Web app di prova (PWA) che invia **notifiche push a iPhone**.

## Come funziona

- `public/` — la web app: pagina, `manifest.webmanifest`, service worker `sw.js` che riceve i push e mostra le notifiche.
- `scripts/send-push.js` + `.github/workflows/` — pubblicazione su GitHub Pages e invio dei push da GitHub Actions, senza server.
- `server.js` — (opzionale) piccolo server Node che serve la app e invia i push con il protocollo Web Push (chiavi VAPID, libreria `web-push`). Le chiavi vengono generate al primo avvio in `vapid.json`, le iscrizioni salvate in `subscriptions.json`.

## Requisiti iPhone

- **iOS / iPadOS 16.4 o successivo**
- La app va aperta in **Safari** e **aggiunta alla schermata Home**: le notifiche non funzionano dentro Safari, solo dall'app installata.
- Il sito deve essere servito in **HTTPS** (un indirizzo `http://192.168...` della rete locale non basta).

## Pubblicazione su GitHub Pages (senza server)

La web app è statica, quindi può stare su GitHub Pages. In questo caso i push non partono da `server.js` ma da una GitHub Action.

**Una volta sola:**

1. **Attiva Pages:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***. Poi in *Actions* rilancia **Pubblica su GitHub Pages** (o fai un push). L'indirizzo sarà `https://<utente>.github.io/TestNotifiche/`.
2. **Chiave privata:** *Settings → Secrets and variables → Actions → New repository secret*, nome `VAPID_PRIVATE_KEY`, valore = la chiave privata che corrisponde alla chiave pubblica in `public/config.js`.
   Per usare una coppia di chiavi tua: `npx web-push generate-vapid-keys`, metti la pubblica in `public/config.js` e la privata nel secret.
3. **Sull'iPhone:** apri l'indirizzo in Safari → *Condividi → Aggiungi alla schermata Home* → apri l'app → **Attiva notifiche** → **Copia sottoscrizione**.
4. Crea un altro secret `PUSH_SUBSCRIPTION` e incolla la sottoscrizione copiata. Per più dispositivi incolla un array JSON: `[{...}, {...}]`.

**Per inviare una notifica:** *Actions → Invia notifica push → Run workflow*, scrivi titolo e messaggio e avvia. Funziona anche dall'app GitHub sul telefono, che puoi bloccare mentre aspetti.

> Se riattivi le notifiche (o reinstalli l'app) la sottoscrizione cambia: copiala di nuovo nel secret.

## Avvio locale

```bash
npm install
npm start          # http://localhost:3000
```

Per raggiungerlo dall'iPhone in HTTPS serve un tunnel, ad esempio:

```bash
npx cloudflared tunnel --url http://localhost:3000
# oppure: ngrok http 3000
```

e apri sull'iPhone l'indirizzo `https://...` che viene stampato.

## Deploy con server (alternativa)

Il repo include `render.yaml`: su [Render](https://render.com) → *New* → *Blueprint* → seleziona questo repository. Otterrai un indirizzo HTTPS pubblico.

> Sul piano gratuito il disco non è persistente: a ogni riavvio cambiano le chiavi VAPID e si perdono le iscrizioni. Per evitarlo imposta le variabili `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (generale con `npx web-push generate-vapid-keys`). Dopo un riavvio basta comunque toccare di nuovo "Attiva notifiche".

## Prova sull'iPhone

1. Apri l'indirizzo HTTPS in **Safari**.
2. Tocca **Condividi** → **Aggiungi alla schermata Home**.
3. Apri l'app **Notifiche** dalla Home.
4. Tocca **Attiva notifiche** e consenti.
5. Prova:
   - **Notifica locale** — mostrata subito dal telefono stesso.
   - **Push dal server** — passa dai server Apple, come una notifica vera.
   - **Push tra 10 s** — tocca, chiudi l'app o blocca il telefono, e aspetta.

Puoi anche inviare un push da terminale a tutti i dispositivi iscritti:

```bash
curl -X POST https://TUO-INDIRIZZO/api/send \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ciao","body":"Notifica dal terminale"}'
```

## API

| Metodo | Percorso | Descrizione |
| --- | --- | --- |
| GET | `/api/vapid-public-key` | chiave pubblica VAPID |
| POST | `/api/subscribe` | registra una sottoscrizione push |
| POST | `/api/unsubscribe` | rimuove una sottoscrizione (`{ endpoint }`) |
| POST | `/api/send` | invia a tutti (`{ title, body, delay }`, `delay` in secondi, max 60) |
| GET | `/api/status` | numero di dispositivi iscritti |

> È un progetto di prova: le API non hanno autenticazione, quindi chiunque conosca l'indirizzo può inviare notifiche agli iscritti.

## Problemi comuni

- **Dice che i push non sono supportati** → non hai aperto l'app dalla Home, oppure iOS è precedente alla 16.4.
- **Permesso "denied"** → Impostazioni → Notifiche → Notifiche (app) → consenti; oppure elimina l'app dalla Home e reinstallala.
- **Push inviato ma non arriva** → controlla che Full immersion / Non disturbare sia spento.
