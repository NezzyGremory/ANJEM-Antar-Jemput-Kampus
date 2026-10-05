/* ═══════════════════════════════════════════════════════
   ANJEM — Antar Jemput Kampus  |  app.js
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── Helpers ── */
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rp  = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const fmtTime = s => { const d = new Date(s); return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Logo SVG ── */
const LOGO = z => `<svg width="${z}" height="${z}" viewBox="0 0 56 56">
  <rect width="56" height="56" rx="16" fill="#1d4ed8"/>
  <path d="M28 10a12 12 0 0 1 12 12c0 10-12 24-12 24S16 32 16 22A12 12 0 0 1 28 10z" fill="#fff" opacity=".95"/>
  <path d="M22 22h12M26 17l6 5-6 5" stroke="#1d4ed8" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ── App State ── */
const S = { token: localStorage.getItem('t'), user: null, ev: () => {}, serverIP: null };
let map, mk = {}, poly, sock, watch, C = {}, D = {};

/* ── Order Status Labels ── */
const ST = {
  SEARCHING_DRIVER : 'Mencari driver…',
  DRIVER_ASSIGNED  : 'Driver ditugaskan',
  DRIVER_ON_THE_WAY: 'Driver menuju lokasi jemput',
  DRIVER_ARRIVED   : 'Driver sudah tiba!',
  TRIP_STARTED     : 'Perjalanan dimulai',
  TRIP_COMPLETED   : 'Perjalanan selesai',
  CANCELLED        : 'Dibatalkan'
};
const STEP = ['SEARCHING_DRIVER','DRIVER_ON_THE_WAY','DRIVER_ARRIVED','TRIP_STARTED','TRIP_COMPLETED'];
const bar  = s => `<div class="steps">${STEP.map((_,k)=>`<i class="${k<=Math.max(0,STEP.indexOf(s))?'on':''}"></i>`).join('')}</div>`;

/* ── Chime (Web Audio) ── */
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[587.33, 0], [880, 0.13], [1046.5, 0.26]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.6);
    });
    if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 200]);
  } catch {}
}

/* ── API fetch wrapper ── */
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method  : opts.m || 'GET',
    headers : { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body    : opts.b ? JSON.stringify(opts.b) : undefined
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan');
  return j;
}

/* ── Toast ── */
function toast(msg, dur = 3000) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.className = 'show';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.className = '', dur);
}

/* ── Modal ── */
function modal(html) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div>${html}</div>`;
  m.onclick = e => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  return m;
}

/* ── WebSocket ── */
function connect() {
  if (sock) { sock.onclose = null; sock.close(); }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  sock = new WebSocket(`${proto}://${location.host}/ws?token=${S.token}`);
  sock.onmessage = e => { try { const m = JSON.parse(e.data); S.ev(m.ev, m.data); } catch {} };
  sock.onclose   = () => S.token && setTimeout(connect, 3000);
}

function logout() {
  S.token = null; S.user = null; localStorage.removeItem('t');
  if (sock) { sock.onclose = null; sock.close(); }
  navigator.geolocation && watch && navigator.geolocation.clearWatch(watch);
  authView();
}

/* ════════════════════════════════════════════════════════
   MAP ENGINE  (Leaflet + OpenStreetMap + OSRM)
════════════════════════════════════════════════════════ */
const ICON_COLOR = { Jemput:'#1d4ed8', Tujuan:'#ef4444', Driver:'#0f172a', Saya:'#16a34a' };

function makeIcon(color, pulse = false) {
  const ring = pulse ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2.5px solid ${color};opacity:.6;animation:radarPing 2s infinite"></div>` : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:26px;height:26px">${ring}<div style="width:26px;height:26px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35)"></div></div>`,
    iconSize: [26, 26], iconAnchor: [13, 13]
  });
}

function initMap() {
  mk = {}; poly = null;
  if (map) { map.remove(); map = null; }
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-7.0513, 110.438], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function setMk(key, pos, pulse = false) {
  if (!map) return;
  const latlng = [pos.lat, pos.lng], color = ICON_COLOR[key] || '#1d4ed8';
  if (mk[key]) { mk[key].setLatLng(latlng); }
  else { mk[key] = L.marker(latlng, { icon: makeIcon(color, pulse) }).addTo(map); }
}

function delMk(key) { if (mk[key]) { mk[key].remove(); delete mk[key]; } }

async function drawRoute(a, b) {
  const e = await api('/maps/estimate', { m: 'POST', b: { pickup: a, destination: b } });
  if (map) {
    if (poly) { poly.remove(); poly = null; }
    if (Array.isArray(e.polyline) && e.polyline.length >= 2) {
      poly = L.polyline(e.polyline, { color: '#1d4ed8', weight: 5, opacity: .88, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      map.fitBounds(poly.getBounds(), { paddingBottomRight: [30, 360], paddingTopLeft: [30, 80] });
    }
  }
  return e;
}

/* ════════════════════════════════════════════════════════
   AUTH — NIM-based login / register
════════════════════════════════════════════════════════ */
function authView(reg = false, defRole = 'customer') {
  let role = defRole;

  const render = () => {
    $('#app').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-bg-circle"></div>
      <div class="auth-bg-circle"></div>
      <div class="auth-box">

        <div class="auth-logo-wrap">${LOGO(60)}</div>
        <div class="center">
          <div class="auth-title">ANJEM</div>
          <div class="auth-sub">Antar Jemput Kampus · Gerak Cepat, Sampai Tepat</div>
        </div>

        ${reg ? `
        <div class="tab-group" style="margin-top:16px">
          <button class="tab-btn ${role==='customer'?'on':''}" id="t_cust">🎓 Mahasiswa</button>
          <button class="tab-btn ${role==='driver'?'on':''}" id="t_drv">🛵 Mitra Driver</button>
        </div>
        <input id="n" placeholder="Nama lengkap" autocomplete="name">
        <input id="ph" placeholder="No. WhatsApp / HP" type="tel" autocomplete="tel">
        ` : ''}

        <label class="auth-nim-label">NIM (Nomor Induk Mahasiswa)</label>
        <div class="auth-nim-wrap">
          <span class="auth-nim-prefix">NIM</span>
          <input id="nim" class="auth-nim-input" placeholder="60124030" type="tel"
            inputmode="numeric" pattern="[0-9]*" autocomplete="username" maxlength="12">
        </div>
        <small style="color:var(--g);margin-bottom:8px;display:block">
          ${reg?'Contoh: 60124030  ·  Admin gunakan email lengkap':'Contoh: 60124030  ·  Admin: admin@anjem.test'}
        </small>

        <input id="pw" type="password" placeholder="Password" autocomplete="${reg?'new-password':'current-password'}">

        ${reg && role === 'driver' ? `
        <div style="background:var(--bl);border-radius:14px;padding:14px;margin:8px 0">
          <small style="font-weight:700;color:var(--b);display:block;margin-bottom:6px">🛵 Data Kendaraan</small>
          <select id="vt"><option value="Motor">Sepeda Motor</option><option value="Mobil">Mobil / Minibus</option></select>
          <input id="vb" placeholder="Merk & Model (Honda Beat 2022)">
          <input id="vp" placeholder="Nomor Plat (H 1234 XY)">
        </div>
        ` : ''}

        <button class="btn" id="btn_ok" style="margin-top:16px">
          ${reg ? (role==='driver'?'Daftar Jadi Mitra Driver':'Daftar Akun Mahasiswa') : 'Masuk ke ANJEM'}
        </button>
        <button class="btn ghost" id="btn_sw">
          ${reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}
        </button>

        ${!reg ? `
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--l);text-align:center">
          <small class="muted" style="display:block;margin-bottom:8px">⚡ Quick Login Demo</small>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
            <button class="badge" style="cursor:pointer;border:0;padding:6px 12px" id="qk_c">🎓 Customer Demo</button>
            <button class="badge green" style="cursor:pointer;border:0;padding:6px 12px" id="qk_d">🛵 Driver Demo</button>
            <button class="badge dark" style="cursor:pointer;border:0;padding:6px 12px" id="qk_a">🛡️ Admin Demo</button>
          </div>
        </div>` : ''}

      </div>
    </div>`;

    /* Tab switch */
    $('#t_cust')?.addEventListener('click', () => { role = 'customer'; render(); });
    $('#t_drv')?.addEventListener('click',  () => { role = 'driver';   render(); });
    $('#btn_sw').addEventListener('click',  () => authView(!reg, role));

    /* Enter key trigger */
    ['nim','pw'].forEach(id => {
      const el = $('#' + id);
      if (el) el.addEventListener('keydown', e => e.key === 'Enter' && $('#btn_ok').click());
    });

    /* Main submit */
    $('#btn_ok').addEventListener('click', async () => {
      const btn = $('#btn_ok'), origText = btn.textContent;
      btn.textContent = 'Memproses…'; btn.disabled = true;
      try {
        const nimVal = $('#nim').value.trim();
        const pwVal  = $('#pw').value;
        const body   = reg
          ? { name: $('#n')?.value, phone: $('#ph')?.value, nim: nimVal, password: pwVal, role,
              vehicle_type: $('#vt')?.value, brand: $('#vb')?.value, plate_number: $('#vp')?.value }
          : { nim: nimVal, password: pwVal };
        const r = await api(reg ? '/auth/register' : '/auth/login', { m: 'POST', b: body });
        S.token = r.token; S.user = r.user; localStorage.setItem('t', r.token);
        connect(); route();
      } catch (e) { toast(e.message); }
      finally { btn.textContent = origText; btn.disabled = false; }
    });

    /* Quick login buttons */
    const qkLogin = async (nim, pw) => {
      try {
        const r = await api('/auth/login', { m: 'POST', b: { nim, password: pw } });
        S.token = r.token; S.user = r.user; localStorage.setItem('t', r.token);
        connect(); route();
      } catch (e) { toast(e.message); }
    };
    $('#qk_c')?.addEventListener('click', () => qkLogin('60124001','password123'));
    $('#qk_d')?.addEventListener('click', () => qkLogin('60130001','password123'));
    $('#qk_a')?.addEventListener('click', () => qkLogin('admin@anjem.test','admin12345'));
  };

  render();
}

const route = () => ({ customer, driver, admin })[S.user.role]?.();

async function boot() {
  try {
    if (!S.token) throw 0;
    S.user = await api('/users/me');
    connect(); route();
  } catch {
    S.token = null; localStorage.removeItem('t'); authView();
  }
}

/* ════════════════════════════════════════════════════════
   TOP BAR  (shared between customer & driver)
════════════════════════════════════════════════════════ */
function topBarHTML() {
  const isD = S.user?.role === 'driver';
  return `
  <div class="top">
    <div class="top-brand">
      ${LOGO(24)}
      <span>ANJEM</span>
      <span class="badge ${isD?'green':'dark'}" style="font-size:10px;padding:2px 7px">
        ${isD ? '🛵 Driver' : '🎓 Kampus'}
      </span>
    </div>
    <div class="top-actions">
      <button id="btn_hist" title="Riwayat">📋</button>
      <button id="btn_prof" title="Profil & Pengaturan">👤</button>
    </div>
  </div>`;
}

function wireTopBar() {
  $('#btn_hist')?.addEventListener('click', async () => {
    const h = await api('/history');
    modal(`
      <div class="sheet-handle"></div>
      <h3 style="margin:0 0 14px">Riwayat Perjalanan</h3>
      ${h.length ? h.map(o => `
        <div class="item anim-fadeIn">
          <div class="row">
            <b style="font-size:14px">${esc(o.destination_address)}</b>
            <span class="badge ${o.status==='TRIP_COMPLETED'?'green':o.status==='CANCELLED'?'red':''}">${ST[o.status]||o.status}</span>
          </div>
          <small>${esc((o.created_at||'').slice(0,10))} · ${o.distance_km} km · ${rp(o.final_price||o.estimated_price)}${o.my_rating?' · ⭐'+o.my_rating:''}</small>
        </div>`).join('') : '<p class="muted center" style="padding:30px 0">Belum ada perjalanan.</p>'}
    `);
  });

  $('#btn_prof')?.addEventListener('click', () => {
    const isCust = S.user.role === 'customer';
    const m = modal(`
      <div class="sheet-handle"></div>
      <div class="card" style="margin-bottom:16px">
        <div class="av">${esc((S.user.name||'?')[0])}</div>
        <div class="grow">
          <b>${esc(S.user.name)}</b>
          ${S.user.nim ? `<small>NIM: ${esc(S.user.nim)}</small>` : `<small>${esc(S.user.email)}</small>`}
          <span class="badge ${isCust?'':'green'}" style="font-size:11px;margin-top:4px;display:inline-block">${esc(S.user.role)}</span>
        </div>
      </div>
      <h3 style="margin:0 0 10px">Edit Profil</h3>
      <input id="pn" value="${esc(S.user.name)}" placeholder="Nama">
      <input id="pp" value="${esc(S.user.phone||'')}" placeholder="No. HP / WhatsApp">
      <button class="btn" id="sv_prof">Simpan Profil</button>
      ${isCust ? `
      <div style="margin:16px 0;padding:14px;background:var(--sl);border-radius:14px;text-align:center">
        <b>🛵 Ingin jadi Mitra Driver?</b>
        <p class="muted" style="font-size:13px;margin:4px 0 10px">Daftarkan motormu, dapat penghasilan tambahan.</p>
        <button class="btn green sm" id="upg_drv" style="margin:0 auto">Daftar Jadi Driver</button>
      </div>` : ''}
      <button class="btn red" id="lo_btn" style="margin-top:8px">Keluar (Logout)</button>
    `);

    m.querySelector('#sv_prof')?.addEventListener('click', async () => {
      try {
        S.user = await api('/users/me', { m:'PATCH', b:{ name: m.querySelector('#pn').value, phone: m.querySelector('#pp').value } });
        toast('Profil berhasil diperbarui'); m.remove();
      } catch(e) { toast(e.message); }
    });

    m.querySelector('#lo_btn')?.addEventListener('click', () => { m.remove(); logout(); });

    if (isCust) {
      m.querySelector('#upg_drv')?.addEventListener('click', () => {
        m.remove();
        const dm = modal(`
          <div class="sheet-handle"></div>
          <h3>Daftar Mitra Driver ANJEM</h3>
          <p class="muted" style="font-size:13px">Isi data kendaraan untuk mulai menerima orderan kampus.</p>
          <select id="dvt"><option value="Motor">Sepeda Motor</option><option value="Mobil">Mobil</option></select>
          <input id="dvb" placeholder="Merk & Model (Honda Beat 2022)">
          <input id="dvp" placeholder="Nomor Plat (H 1234 XY)">
          <button class="btn green" id="reg_drv">Aktifkan Akun Driver</button>
        `);
        dm.querySelector('#reg_drv')?.addEventListener('click', async () => {
          try {
            const res = await api('/drivers/register', { m:'POST', b:{
              vehicle_type: dm.querySelector('#dvt').value,
              brand: dm.querySelector('#dvb').value,
              plate_number: dm.querySelector('#dvp').value
            }});
            S.token = res.token; S.user = res.user; localStorage.setItem('t', res.token);
            dm.remove(); toast('Selamat! Akun Driver berhasil diaktifkan 🎉'); driver();
          } catch(e) { toast(e.message); }
        });
      });
    }
  });
}

/* ════════════════════════════════════════════════════════
   CHAT WINDOW
════════════════════════════════════════════════════════ */
let chatOrderId = null, chatInterval = null;

function openChat(orderId, partnerName, partnerPhone) {
  chatOrderId = orderId;
  clearInterval(chatInterval);

  const wrap = document.createElement('div');
  wrap.className = 'chat-modal-wrap';
  wrap.innerHTML = `
    <div class="chat-box">
      <div class="chat-header">
        <div class="av green" style="width:40px;height:40px;font-size:15px">${esc((partnerName||'?')[0])}</div>
        <div class="grow">
          <b>${esc(partnerName)}</b>
          <small>Order #${orderId}</small>
        </div>
        ${partnerPhone ? `<a href="tel:${esc(partnerPhone)}" class="btn green sm" style="margin:0;text-decoration:none">📞 Telpon</a>` : ''}
        <button id="chat_close" style="background:none;border:0;font-size:22px;cursor:pointer;color:var(--g)">✕</button>
      </div>
      <div class="chat-messages" id="chat_msgs">
        <div class="center muted" style="margin:auto;padding:30px 0">
          <div class="skel" style="width:60%;margin:0 auto 8px"></div>
          <div class="skel" style="width:40%;margin:0 auto"></div>
        </div>
      </div>
      <div class="chat-input-row">
        <textarea id="chat_input" placeholder="Ketik pesan…" rows="1"></textarea>
        <button class="chat-send" id="chat_send">➤</button>
      </div>
    </div>`;

  document.body.appendChild(wrap);
  wrap.querySelector('#chat_close').addEventListener('click', () => {
    wrap.remove(); clearInterval(chatInterval); chatOrderId = null;
  });

  const msgEl = wrap.querySelector('#chat_msgs');
  const input  = wrap.querySelector('#chat_input');
  const sendBtn= wrap.querySelector('#chat_send');

  /* Auto-resize textarea */
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } });

  const loadMsgs = async () => {
    try {
      const msgs = await api(`/chat/${orderId}`);
      const wasBottom = msgEl.scrollHeight - msgEl.scrollTop <= msgEl.clientHeight + 40;
      msgEl.innerHTML = msgs.length
        ? msgs.map(m => `
          <div class="chat-bubble ${m.sender_id === S.user.id ? 'mine' : 'theirs'}">
            ${esc(m.message)}
            <time>${fmtTime(m.created_at)}</time>
          </div>`).join('')
        : '<p class="muted center" style="margin:auto">Belum ada pesan. Mulai ngobrol!</p>';
      if (wasBottom || msgs.length <= 1) msgEl.scrollTop = msgEl.scrollHeight;
    } catch {}
  };

  loadMsgs();
  chatInterval = setInterval(loadMsgs, 2500);

  sendBtn.addEventListener('click', async () => {
    const txt = input.value.trim();
    if (!txt) return;
    input.value = ''; input.style.height = 'auto';
    try {
      await api(`/chat/${orderId}`, { m:'POST', b:{ message: txt } });
      loadMsgs();
    } catch(e) { toast(e.message); }
  });
}

/* ════════════════════════════════════════════════════════
   CUSTOMER
════════════════════════════════════════════════════════ */
const summaryHTML = o => `
<div class="stats">
  <div><small>Jarak</small><b>${o.distance_km} km</b></div>
  <div><small>Estimasi</small><b>${o.estimated_duration} mnt</b></div>
  <div><small>Tarif</small><b>${rp(o.final_price || o.estimated_price)}</b></div>
</div>`;

const lstHTML = (el, arr, fn) => {
  el.innerHTML = arr.map((x, i) => `
    <div class="item" data-i="${i}">
      <b>${esc(x.name || x.address)}</b>
      <small>${esc(x.address)}</small>
    </div>`).join('');
  el.addEventListener('click', e => {
    const n = e.target.closest('.item');
    if (n) fn(arr[+n.dataset.i]);
  });
};

async function customer() {
  $('#app').innerHTML = `<div id="map"></div>${topBarHTML()}<div class="sheet" id="sh"></div>`;
  wireTopBar(); C = {};
  S.ev = (ev, d) => {
    if (ev === 'order:update') track(d);
    if (ev === 'driver:location') setMk('Driver', d);
    if (ev === 'chat:message' && d.order_id === C.o?.id) { toast(`💬 ${esc(d.sender_name)}: ${esc(d.message)}`); }
  };
  initMap();
  const act = (await api('/orders?active=1'))[0];
  if (act) return track(act);
  homeScreen();
  /* Default location first, then GPS */
  setPickup(-7.0513, 110.438);
  navigator.geolocation?.getCurrentPosition(
    p => setPickup(p.coords.latitude, p.coords.longitude),
    () => {}, { enableHighAccuracy: true, timeout: 8000 }
  );
  /* Click map → pick destination */
  map?.on('click', async e => {
    if (C.pick) { C.pick = false; setPickup(e.latlng.lat, e.latlng.lng); return; }
    if (!C.o && C.pu) {
      const { lat, lng } = e.latlng;
      setMk('Tujuan', { lat, lng });
      toast('Menghitung rute…');
      let addr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try { const g = await api(`/maps/geocode?lat=${lat}&lng=${lng}`); if (g.address) addr = g.address; } catch {}
      pick({ name: addr.split(',')[0] || addr, address: addr, lat, lng });
    }
  });
}

const paintPickup = () => { const el = $('#pu'); if (el) el.textContent = C.pu ? C.pu.address : 'Mendeteksi lokasi GPS…'; };

async function setPickup(lat, lng) {
  C.pu = { lat, lng, address: 'Mencari alamat…' };
  setMk('Jemput', C.pu);
  map?.panTo([lat, lng]);
  paintPickup();
  try { C.pu.address = (await api(`/maps/geocode?lat=${lat}&lng=${lng}`)).address; }
  catch { C.pu.address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  paintPickup();
}

async function homeScreen() {
  C.o = null;
  if (poly) { poly.remove(); poly = null; }
  delMk('Tujuan'); delMk('Driver');
  $('#sh').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="row" style="margin-bottom:12px">
      <b style="font-size:20px;letter-spacing:-.3px">Mau ke mana?</b>
      <span class="badge dark">Kampus</span>
    </div>
    <div class="loc">
      <span class="dot b"></span>
      <div id="pu" class="grow" style="font-size:13px;color:var(--g)"></div>
      <button class="link" id="chg_pu" style="font-size:12px">Ubah</button>
    </div>
    <input id="q_dest" placeholder="🔍  Cari tujuan atau ketuk langsung di peta…" autocomplete="off" style="margin:6px 0">
    <div id="res_dest"></div>
    <p class="muted" id="lbl_recent" style="font-size:12px;margin:10px 0 4px"></p>
    <div id="rec_dest"></div>`;
  paintPickup();
  $('#chg_pu').addEventListener('click', () => { C.pick = true; toast('Ketuk di peta untuk posisi jemput'); });
  let t;
  $('#q_dest').addEventListener('input', e => {
    clearTimeout(t);
    const v = e.target.value.trim();
    if (v.length < 2) return ($('#res_dest').innerHTML = '');
    t = setTimeout(async () => {
      try {
        const c = C.pu || { lat: -7.0513, lng: 110.438 };
        lstHTML($('#res_dest'), await api(`/maps/search?q=${encodeURIComponent(v)}&lat=${c.lat}&lng=${c.lng}`), pick);
      } catch(e) { toast(e.message); }
    }, 400);
  });
  try {
    const rec = await api('/locations/recent');
    if (rec.length) { $('#lbl_recent').textContent = 'Tujuan terakhir'; lstHTML($('#rec_dest'), rec, pick); }
  } catch {}
}

async function pick(x) {
  if (!C.pu) return toast('Lokasi jemput belum terdeteksi');
  setMk('Tujuan', x);
  $('#sh').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="center muted" style="padding:16px 0">
      <div style="display:inline-block;width:28px;height:28px;border:3px solid var(--b);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px"></div>
      <br>Menghitung rute & tarif terbaik…
    </div>`;
  let e;
  try { e = await drawRoute(C.pu, x); }
  catch(er) { toast(er.message); return homeScreen(); }

  $('#sh').innerHTML = `
    <div class="sheet-handle"></div>
    <div class="row" style="margin-bottom:4px">
      <b style="font-size:18px;letter-spacing:-.3px">Konfirmasi Antar-Jemput</b>
      <span class="badge green">Rute Ditemukan ✓</span>
    </div>

    <!-- PRICE REVEAL CARD (main animation) -->
    <div class="price-card">
      <div class="price-icon">🛵</div>
      <div class="grow">
        <div style="font-size:12px;color:var(--g);font-weight:600;text-transform:uppercase;letter-spacing:.06em">ANJEM Kampus</div>
        <div class="price-amount">${rp(e.price)}</div>
        <div class="price-label">Bayar tunai ke driver</div>
      </div>
    </div>

    <!-- Route detail -->
    <div style="background:var(--bg);border-radius:16px;padding:12px;margin:8px 0">
      <div class="loc" style="padding:4px 0">
        <span class="dot b"></span>
        <div class="grow"><small>Titik Jemput</small><br><b style="font-size:13px">${esc(C.pu.address)}</b></div>
      </div>
      <div class="loc-line"></div>
      <div class="loc" style="padding:4px 0">
        <span class="dot r"></span>
        <div class="grow"><small>Tujuan</small><br><b style="font-size:13px">${esc(x.name || x.address)}</b></div>
      </div>
    </div>

    ${summaryHTML(e)}

    <button class="btn" id="btn_order">🛵  Pesan ANJEM Sekarang</button>
    <button class="btn ghost" id="btn_back">Ganti Lokasi Tujuan</button>`;

  $('#btn_back').addEventListener('click', homeScreen);
  $('#btn_order').addEventListener('click', async () => {
    const btn = $('#btn_order'); btn.textContent = 'Memesan…'; btn.disabled = true;
    try { track(await api('/orders', { m:'POST', b:{ pickup: C.pu, destination: x } })); }
    catch(er) { toast(er.message); btn.textContent = '🛵  Pesan ANJEM Sekarang'; btn.disabled = false; }
  });
}

async function track(o) {
  const first = !C.o || C.o.id !== o.id, s = o.status; C.o = o;
  const P = { lat: o.pickup_latitude, lng: o.pickup_longitude };
  const T = { lat: o.destination_latitude, lng: o.destination_longitude };
  setMk('Jemput', P); setMk('Tujuan', T);
  if (o.driver_id && o.dlat && !['TRIP_COMPLETED','CANCELLED'].includes(s)) setMk('Driver', { lat: o.dlat, lng: o.dlng });
  if (first && map) drawRoute(P, T).catch(() => {});

  let h = `
    <div class="sheet-handle"></div>
    <div class="row" style="margin-bottom:4px">
      <b style="font-size:17px">${ST[s] || s}</b>
      <span class="badge dark">#${o.id}</span>
    </div>
    ${bar(s)}`;

  if (s === 'SEARCHING_DRIVER') {
    h += `
    <div class="radar-wrap">
      <div class="radar-ring"></div><div class="radar-ring"></div><div class="radar-ring"></div>
      <div class="radar-center">🛵</div>
    </div>
    <p class="center muted" style="margin-top:4px;font-size:14px">Menghubungkan ke driver ANJEM terdekat…</p>`;
  } else if (o.driver_name) {
    h += `
    <div class="card highlight anim-bounceIn" style="margin-top:10px">
      <div class="av">${esc(o.driver_name[0])}</div>
      <div class="grow">
        <b>${esc(o.driver_name)}</b> ⭐ ${o.driver_rating}<br>
        <small>${esc(o.vehicle_type||'Motor')} · ${esc(o.brand||'')} · ${esc(o.plate_number||'')}</small>
      </div>
      <div style="display:flex;gap:6px;flex-direction:column">
        ${o.driver_phone ? `<a href="tel:${esc(o.driver_phone)}" class="btn green sm" style="text-decoration:none;padding:8px 12px">📞</a>` : ''}
        <button class="btn sm" id="btn_chat" style="padding:8px 12px">💬</button>
      </div>
    </div>`;
  }

  h += summaryHTML(o);
  if (['SEARCHING_DRIVER','DRIVER_ON_THE_WAY','DRIVER_ARRIVED'].includes(s))
    h += `<button class="btn red" id="btn_cancel">Batalkan Pesanan</button>`;
  if (s === 'TRIP_COMPLETED') {
    h += `
    <div class="price-card anim-popIn" style="margin-top:12px">
      <div class="price-icon">✅</div>
      <div class="grow"><small>Total Dibayar</small><div class="price-amount">${rp(o.final_price)}</div></div>
    </div>
    <p class="center" style="margin-top:14px"><b>Beri Penilaian Driver</b></p>
    <div class="stars" id="star_rating">${[1,2,3,4,5].map(n=>`<span data-n="${n}">★</span>`).join('')}</div>
    <button class="btn" id="btn_rate">Kirim Ulasan</button>`;
  }
  if (['TRIP_COMPLETED','CANCELLED'].includes(s))
    h += `<button class="btn ghost" id="btn_done" style="margin-top:8px">Selesai & Pesan Lagi</button>`;

  $('#sh').innerHTML = h;

  $('#btn_cancel')?.addEventListener('click', async () => {
    if (!confirm('Batalkan pesanan ini?')) return;
    try { await api(`/orders/${o.id}/status`, { m:'PATCH', b:{ status:'CANCELLED' } }); }
    catch(e) { toast(e.message); }
  });
  $('#btn_chat')?.addEventListener('click', () => openChat(o.id, o.driver_name, o.driver_phone));
  $('#btn_done')?.addEventListener('click', customer);

  if ($('#star_rating')) {
    let rating = 0;
    $('#star_rating').addEventListener('click', e => {
      rating = +e.target.dataset.n || rating;
      [...$$('#star_rating span')].forEach((s, i) => s.className = i < rating ? 'on' : '');
    });
    $('#btn_rate')?.addEventListener('click', async () => {
      if (!rating) return toast('Pilih bintang terlebih dahulu');
      try { await api('/ratings', { m:'POST', b:{ order_id: o.id, rating } }); toast('Terima kasih atas ulasan Anda! ⭐'); customer(); }
      catch(e) { toast(e.message); }
    });
  }
}

/* ════════════════════════════════════════════════════════
   DRIVER
════════════════════════════════════════════════════════ */
const NEXT = {
  DRIVER_ON_THE_WAY : ['arrive',   'Sudah Tiba di Lokasi Jemput'],
  DRIVER_ARRIVED    : ['start',    'Mulai Perjalanan'],
  TRIP_STARTED      : ['complete', 'Selesaikan Perjalanan (Tiba di Tujuan)']
};

async function driver() {
  $('#app').innerHTML = `<div id="map"></div>${topBarHTML()}<div class="sheet" id="sh"></div>`;
  wireTopBar(); D = { t: 0, pend: [] };
  initMap();
  D.me = await api('/drivers/me');
  D.o  = (await api('/orders?active=1'))[0];
  if (D.me.status === 'AVAILABLE') D.pend = await api('/orders/pending');

  S.ev = (ev, d) => {
    if (ev === 'order:new') {
      playChime();
      D.pend = [d, ...D.pend.filter(x => x.id !== d.id)];
      toast('🔔 Order baru masuk! Lihat di bawah.');
      dpaint();
    }
    if (ev === 'order:update') {
      if (d.driver_id === D.me.id) D.o = d;
      D.pend = D.pend.filter(x => x.id !== d.id);
      if (['TRIP_COMPLETED','CANCELLED'].includes(d.status)) D.me.status = 'AVAILABLE';
      dpaint();
    }
    if (ev === 'chat:message' && D.o && d.order_id === D.o.id)
      toast(`💬 Customer: ${esc(d.message)}`);
  };

  navigator.geolocation?.clearWatch(watch);
  watch = navigator.geolocation?.watchPosition(
    p => {
      D.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      const first = !mk.Saya; setMk('Saya', D.pos);
      if (first) map?.panTo([D.pos.lat, D.pos.lng]);
      if (Date.now() - D.t > 4000) {
        D.t = Date.now();
        api('/drivers/location', { m:'PATCH', b: D.pos }).catch(() => {});
      }
    },
    () => toast('Aktifkan GPS untuk navigasi akurat'),
    { enableHighAccuracy: true }
  );
  dpaint();
}

async function dpaint() {
  const o = D.o, me = D.me; let h = '<div class="sheet-handle"></div>';
  if (o) {
    const s = o.status;
    const P = { lat: o.pickup_latitude, lng: o.pickup_longitude };
    const T = { lat: o.destination_latitude, lng: o.destination_longitude };
    setMk('Jemput', P); setMk('Tujuan', T);
    const key = o.id + s;
    if (map && D.rk !== key && D.pos && !['TRIP_COMPLETED','CANCELLED'].includes(s)) {
      D.rk = key;
      drawRoute(s === 'TRIP_STARTED' ? P : D.pos, s === 'TRIP_STARTED' ? T : P).catch(e => toast(e.message));
    }
    h += `
    <div class="row"><b style="font-size:18px">${ST[s]||s}</b><span class="badge dark">Order #${o.id}</span></div>
    ${bar(s)}
    <div class="card anim-slideUp">
      <div class="av orange">${esc((o.customer_name||'?')[0])}</div>
      <div class="grow">
        <b>${esc(o.customer_name)}</b>
        <small style="display:block">Penumpang Kampus</small>
      </div>
      <button class="btn green sm" id="drv_chat" style="margin:0">💬 Chat</button>
    </div>
    <div style="background:var(--bg);border-radius:14px;padding:10px 12px;margin:8px 0">
      <div class="loc" style="padding:3px 0"><span class="dot b"></span><div><small>Jemput</small><br><b style="font-size:13px">${esc(o.pickup_address)}</b></div></div>
      <div class="loc-line"></div>
      <div class="loc" style="padding:3px 0"><span class="dot r"></span><div><small>Tujuan</small><br><b style="font-size:13px">${esc(o.destination_address)}</b></div></div>
    </div>
    ${summaryHTML(o)}`;

    if (NEXT[s]) h += `<button class="btn green" id="btn_nx">${NEXT[s][1]} →</button>`;
    if (s === 'TRIP_COMPLETED') {
      h += `
      <div class="price-card anim-popIn">
        <div class="price-icon">💰</div>
        <div class="grow"><small>Pendapatan Anda</small><div class="price-amount">+${rp(o.final_price)}</div></div>
      </div>`;
    }
    if (['TRIP_COMPLETED','CANCELLED'].includes(s)) h += `<button class="btn ghost" id="btn_back_drv">Kembali ke Beranda</button>`;
    if (['DRIVER_ON_THE_WAY','DRIVER_ARRIVED'].includes(s)) h += `<button class="btn red" id="btn_cx_drv">Batalkan Order</button>`;
  } else {
    const on = me.status !== 'OFFLINE';
    h += `
    <div class="row">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <b style="font-size:20px">${on ? 'Anda Online' : 'Anda Offline'}</b>
          <span class="badge ${on?'green':'yellow'}">${on?'Siap Terima Order':'Istirahat'}</span>
        </div>
        <small>${esc(me.brand||'-')} · ${esc(me.plate_number||'-')}</small>
      </div>
      <label class="switch"><input type="checkbox" id="tg" ${on?'checked':''}><span></span></label>
    </div>
    <div class="stats">
      <div><small>Pendapatan</small><b>${rp(me.earnings)}</b></div>
      <div><small>Trip Sukses</small><b>${me.trips}</b></div>
      <div><small>Rating</small><b>⭐ ${me.rating}</b></div>
    </div>`;

    if (on) {
      if (D.pend.length) {
        h += D.pend.map(p => `
        <div class="order-alert incoming anim-bounceIn">
          <div class="row" style="margin-bottom:8px">
            <b style="color:var(--b)">⚡ Orderan Masuk!</b>
            <span class="badge green">${p.distance_km} km</span>
          </div>
          <div class="loc" style="padding:3px 0"><span class="dot b"></span><div><small>Jemput</small><br><b>${esc(p.pickup_address)}</b></div></div>
          <div class="loc-line"></div>
          <div class="loc" style="padding:3px 0"><span class="dot r"></span><div><small>Tujuan</small><br><b>${esc(p.destination_address)}</b></div></div>
          ${summaryHTML(p)}
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn red" data-r="${p.id}" style="flex:1;margin:0">Tolak</button>
            <button class="btn green" data-a="${p.id}" style="flex:2;margin:0">✓ Terima Orderan</button>
          </div>
        </div>`).join('');
      } else {
        h += `
        <div class="radar-wrap">
          <div class="radar-ring"></div><div class="radar-ring"></div>
          <div class="radar-center">📡</div>
        </div>
        <p class="center muted" style="margin-top:4px;font-size:13px">Menunggu orderan dari mahasiswa…</p>`;
      }
    } else {
      h += `<p class="center muted" style="padding:24px 0">Aktifkan toggle di atas untuk mulai menerima orderan.</p>`;
    }
  }
  $('#sh').innerHTML = h;

  /* Event handlers for driver panel */
  const act = async f => { try { await f(); } catch(e) { toast(e.message); } };
  $('#tg')?.addEventListener('change', e => act(async () => {
    await api('/drivers/status', { m:'PATCH', b:{ status: e.target.checked ? 'ONLINE' : 'OFFLINE' } });
    D.me = await api('/drivers/me');
    D.pend = e.target.checked ? await api('/orders/pending') : [];
    dpaint();
  }));
  $('#btn_nx')?.addEventListener('click', () => act(async () => {
    D.o = await api(`/orders/${o.id}/${NEXT[o.status][0]}`, { m:'POST' }); dpaint();
  }));
  $('#btn_cx_drv')?.addEventListener('click', () => confirm('Batalkan order ini?') && act(
    () => api(`/orders/${o.id}/status`, { m:'PATCH', b:{ status:'CANCELLED' } })
  ));
  $('#btn_back_drv')?.addEventListener('click', () => driver());
  $('#drv_chat')?.addEventListener('click', () => openChat(o.id, o.customer_name, null));

  $$('[data-a]').forEach(b => b.addEventListener('click', () => act(async () => {
    D.o = await api(`/orders/${b.dataset.a}/accept`, { m:'POST' });
    D.me.status = 'BUSY'; D.pend = []; D.rk = null; dpaint();
  })));
  $$('[data-r]').forEach(b => b.addEventListener('click', () => {
    D.pend = D.pend.filter(x => x.id != b.dataset.r); dpaint();
  }));
}

/* ════════════════════════════════════════════════════════
   ADMIN
════════════════════════════════════════════════════════ */
async function admin() {
  $('#app').innerHTML = `
  <div class="adm">
    <header>
      <div class="brand">${LOGO(30)}<b>ANJEM</b> <span class="badge dark" style="font-size:11px">Admin Panel</span></div>
      <nav id="adm_nav">${['Dashboard','Users','Drivers','Orders','Tariffs'].map(t=>`<button data-t="${t}">${t}</button>`).join('')}</nav>
      <button class="link" id="adm_lo">Keluar</button>
    </header>
    <main id="adm_main"></main>
  </div>`;
  $('#adm_lo').addEventListener('click', logout);
  S.ev = () => {};
  $('#adm_nav').addEventListener('click', e => e.target.dataset.t && admTab(e.target.dataset.t));
  admTab('Dashboard');
}

const tblHTML = (cols, rows) => `
<div class="tw"><table>
  <tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>
  ${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}
</table></div>`;

async function admTab(t) {
  $$('#adm_nav button').forEach(b => b.className = b.dataset.t === t ? 'on' : '');
  const m = $('#adm_main'); m.innerHTML = '<p class="muted" style="padding:20px">Memuat…</p>';
  try {
    if (t === 'Dashboard') {
      const s = await api('/admin/stats'), mx = k => Math.max(1, ...s.daily.map(d => d[k]));
      const kpis = [['Customer',s.customers],['Driver',s.drivers],['Driver Online',s.online],['Order Aktif',s.active],['Selesai',s.completed],['Pendapatan',rp(s.revenue)]];
      const chart = (k, fmt) => `<div class="bars">${s.daily.map(d=>`<div><i style="height:${(d[k]/mx(k))*100}px"></i>${fmt(d[k])}<br>${(d.day||'').slice(5)}</div>`).join('')}</div>`;
      m.innerHTML = `
      <div class="grid">${kpis.map(([label,val])=>`<div class="kpi"><small>${label}</small><b>${val}</b></div>`).join('')}</div>
      <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <div class="panel"><b>Order 7 Hari Terakhir</b>${chart('orders',v=>v)}</div>
        <div class="panel"><b>Pendapatan 7 Hari</b>${chart('revenue',v=>v/1000+'k')}</div>
      </div>`;
    } else if (t === 'Users') {
      const users = await api('/admin/users');
      m.innerHTML = `<div class="panel">${tblHTML([
        ['Nama', x=>esc(x.name)],['Email/NIM', x=>esc(x.email?.replace('@anjem.local',''))],
        ['HP', x=>esc(x.phone||'-')],['Role', x=>`<span class="badge ${x.role==='driver'?'green':x.role==='admin'?'dark':''}">${x.role}</span>`],
        ['Daftar', x=>esc((x.created_at||'').slice(0,10))]
      ],users)}</div>`;
    } else if (t === 'Drivers') {
      const drvs = await api('/admin/drivers');
      m.innerHTML = `<div class="panel">${tblHTML([
        ['Nama', x=>esc(x.name)],
        ['Kendaraan', x=>esc(`${x.brand||''} · ${x.plate_number||''}`)],
        ['Status', x=>`<span class="badge ${x.status==='AVAILABLE'?'green':x.status==='BUSY'?'yellow':'red'}">${x.status}</span>`],
        ['Rating', x=>'⭐ '+x.rating],
        ['Akun', x=>`<button class="link" data-id="${x.id}" data-a="${x.is_active?0:1}">${x.is_active?'Aktif · Nonaktifkan':'Nonaktif · Aktifkan'}</button>`]
      ],drvs)}</div>`;
      m.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (id) { await api(`/admin/drivers/${id}/active`, { m:'PATCH', b:{ active: +e.target.dataset.a === 1 } }); admTab('Drivers'); }
      });
    } else if (t === 'Orders') {
      const orders = await api('/admin/orders');
      m.innerHTML = `<div class="panel">${tblHTML([
        ['#', x=>x.id],['Customer', x=>esc(x.customer)],['Driver', x=>esc(x.driver||'-')],
        ['Tujuan', x=>esc(x.destination_address)],['Km', x=>x.distance_km],
        ['Tarif', x=>rp(x.final_price||x.estimated_price)],
        ['Status', x=>`<span class="badge ${x.status==='TRIP_COMPLETED'?'green':x.status==='CANCELLED'?'red':''}">${ST[x.status]||x.status}</span>`]
      ],orders)}</div>`;
    } else {
      const f = await api('/tariffs');
      const fields = [['base_fare','Tarif Dasar (Rp)'],['price_per_km','Tarif per KM (Rp)'],['minimum_fare','Tarif Minimum (Rp)'],['radius_km','Radius Layanan (km)']];
      m.innerHTML = `
      <div class="panel" style="max-width:440px">
        <b style="font-size:16px">Pengaturan Tarif Kampus</b>
        <p class="muted" style="font-size:13px">Formula: tarif dasar + (jarak × tarif/km), dibulatkan ke Rp500.</p>
        ${fields.map(([k,l])=>`<small style="margin-top:8px;display:block;font-weight:600">${l}</small><input id="f_${k}" type="number" min="0" value="${f[k]}">`).join('')}
        <button class="btn" id="sv_tariff" style="margin-top:16px">Simpan Perubahan</button>
      </div>`;
      $('#sv_tariff')?.addEventListener('click', async () => {
        try {
          await api('/tariffs', { m:'PATCH', b: Object.fromEntries(fields.map(([k])=>[k,$('#f_'+k).value])) });
          toast('Tarif kampus berhasil diperbarui ✓');
        } catch(e) { toast(e.message); }
      });
    }
  } catch(e) { m.innerHTML = `<p class="muted" style="padding:20px">${esc(e.message)}</p>`; }
}

/* ════════════════════════════════════════════════════════
   SPLASH → BOOT
════════════════════════════════════════════════════════ */
$('#app').innerHTML = `
<div class="splash">
  <div class="splash-card">
    <span class="splash-logo">${LOGO(84)}</span>
    <div class="splash-title">ANJEM</div>
    <div class="splash-sub">Antar Jemput Kampus</div>
    <div class="splash-dots">
      <span></span><span></span><span></span>
    </div>
  </div>
</div>`;

setTimeout(boot, 1100);
