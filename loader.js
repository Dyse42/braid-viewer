/**
 * Braid loader — the shell's one way in to the record.
 * ======================================================================
 * Two hosting shapes, one entry point:
 *
 *   public  — only `political-braid.json.enc` is served. A passphrase gate
 *             goes up, `braid-crypto.js` decrypts in the browser, and the
 *             plaintext never touches disk or the network.
 *   local   — only `political-braid.json` is served. No gate, no crypto
 *             fetched, behaviour identical to before this file existed.
 *
 * The ciphertext is tried first, so a directory holding both fails closed.
 *
 * Views may not call this; the shell loads once and hands the model down,
 * same rule as BraidCore.index().
 */
(function () {
  const ENC_URL = './political-braid.json.enc';
  const RAW_URL = './political-braid.json';
  const CRYPTO_URL = './braid-crypto.js';

  /* ---------- fetching ---------- */

  function getJSON(url) {
    return fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }

  let cryptoReady = null;
  function loadCrypto() {
    if (window.decryptBraid) return Promise.resolve();
    if (cryptoReady) return cryptoReady;
    cryptoReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CRYPTO_URL;
      s.onload = () => (window.decryptBraid
        ? resolve()
        : reject(new Error('braid-crypto.js loaded but defines no decryptBraid')));
      s.onerror = () => reject(new Error('braid-crypto.js is missing from this site'));
      document.head.appendChild(s);
    });
    return cryptoReady;
  }

  /* ---------- the gate ---------- */

  /* Plain DOM, deliberately: this runs before the component tree exists and
     has to survive whatever the shell is doing behind it. Broadsheet tokens
     are used where they are loaded, with literal fallbacks in case the gate
     goes up before theme/styles.css does. */
  function askPassphrase(blob) {
    return new Promise(resolve => {
      const veil = document.createElement('div');
      veil.setAttribute('data-braid-gate', '');
      veil.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:var(--color-bg,#f3f2f2)',
        'color:var(--color-text,#201e1d)',
        'font-family:var(--font-body,"Source Serif 4",system-ui,sans-serif)'
      ].join(';');

      const card = document.createElement('form');
      card.style.cssText = 'width:min(420px,calc(100vw - 48px));padding:0 4px';

      const h = document.createElement('h1');
      h.textContent = 'The Braid';
      h.style.cssText = 'margin:0;font-size:34px;letter-spacing:-0.025em;font-weight:600';

      const rule = document.createElement('div');
      rule.style.cssText = 'height:3px;background:var(--color-text,#201e1d);margin-top:9px';
      const hair = document.createElement('div');
      hair.style.cssText = 'height:1px;background:var(--color-text,#201e1d);margin-top:2px';

      const note = document.createElement('p');
      note.textContent = 'This record is held encrypted. Enter the passphrase to read it.';
      note.style.cssText = 'margin:18px 0 14px;font-size:15px;line-height:1.45;color:var(--color-neutral-800,#444141)';

      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.setAttribute('aria-label', 'Passphrase');
      input.placeholder = 'Passphrase';
      input.style.cssText = [
        'width:100%', 'box-sizing:border-box', 'padding:10px 12px',
        'font-family:inherit', 'font-size:16px',
        'color:var(--color-text,#201e1d)',
        'background:var(--color-neutral-100,#f8f4f4)',
        'border:1px solid var(--color-neutral-400,#bab6b6)', 'border-radius:2px'
      ].join(';');

      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.textContent = 'Unlock';
      btn.style.cssText = [
        'margin-top:12px', 'padding:9px 20px',
        'font-family:inherit', 'font-size:12px',
        'text-transform:uppercase', 'letter-spacing:0.14em',
        'color:var(--color-neutral-100,#f8f4f4)',
        'background:var(--color-text,#201e1d)',
        'border:0', 'border-radius:2px', 'cursor:pointer'
      ].join(';');

      const msg = document.createElement('p');
      msg.setAttribute('role', 'status');
      msg.style.cssText = 'min-height:1.4em;margin:12px 0 0;font-size:13px;line-height:1.4;color:var(--color-accent-2-700,#aa0b56)';

      card.append(h, rule, hair, note, input, btn, msg);
      veil.appendChild(card);
      document.body.appendChild(veil);
      input.focus();

      const say = (text, bad) => {
        msg.textContent = text;
        msg.style.color = bad
          ? 'var(--color-accent-2-700,#aa0b56)'
          : 'var(--color-neutral-700,#605d5d)';
      };

      card.addEventListener('submit', e => {
        e.preventDefault();
        const pass = input.value;
        if (!pass) { say('Enter the passphrase.', true); return; }

        input.disabled = btn.disabled = true;
        btn.style.opacity = '0.5';
        /* 600k PBKDF2 rounds is a visible pause on purpose — say so rather
           than look hung. */
        say('Deriving key… this takes a second.', false);

        /* Yield a frame so the message paints before the KDF blocks. */
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.decryptBraid(blob, pass)
            .then(db => { veil.remove(); resolve(db); })
            .catch(err => {
              input.disabled = btn.disabled = false;
              btn.style.opacity = '1';
              input.value = '';
              input.focus();
              /* AES-GCM authenticates, so a bad key and a mangled file are
                 the same DOMException. Only the format check can tell them
                 apart, and that already passed. */
              say(err && err.name === 'OperationError'
                ? 'That passphrase did not open this file.'
                : 'Could not decrypt: ' + (err && err.message ? err.message : String(err)), true);
            });
        }));
      });
    });
  }

  /* ---------- entry point ---------- */

  let pending = null;

  function load() {
    if (pending) return pending;
    pending = getJSON(ENC_URL).then(blob => {
      if (blob && blob.format === 'braid-encrypted-v1') {
        return loadCrypto().then(() => askPassphrase(blob));
      }
      return getJSON(RAW_URL).then(db => {
        if (!db) throw new Error('no braid found: neither ' + ENC_URL + ' nor ' + RAW_URL + ' loaded');
        return db;
      });
    });
    return pending;
  }

  window.BraidData = { load: load };
})();
