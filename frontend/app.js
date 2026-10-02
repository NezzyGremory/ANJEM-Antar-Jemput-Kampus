const $=s=>document.querySelector(s),rp=n=>'Rp'+Number(n||0).toLocaleString('id-ID'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={token:localStorage.getItem('t'),user:null,ev:()=>{}};let map,mk={},poly,sock,watch,C={},D={};

const LOGO=z=>`<svg class="logo-anim" width="${z}" height="${z}" viewBox="0 0 56 56"><rect width="56" height="56" rx="16" fill="#1d4ed8"/><path d="M28 11a11 11 0 0 1 11 11c0 9-11 23-11 23S17 31 17 22a11 11 0 0 1 11-11z" fill="#fff"/><path d="M23 22h10m-4-4 4 4-4 4" stroke="#1d4ed8" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ST={SEARCHING_DRIVER:'Mencari driver…',DRIVER_ASSIGNED:'Driver ditugaskan',DRIVER_ON_THE_WAY:'Driver menuju lokasi',DRIVER_ARRIVED:'Driver sudah sampai',TRIP_STARTED:'Perjalanan dimulai',TRIP_COMPLETED:'Perjalanan selesai',CANCELLED:'Dibatalkan'};
const STEP=['SEARCHING_DRIVER','DRIVER_ON_THE_WAY','DRIVER_ARRIVED','TRIP_STARTED','TRIP_COMPLETED'];
const bar=s=>`<div class="steps">${STEP.map((_,k)=>`<i class="${k<=Math.max(0,STEP.indexOf(s))?'on':''}"></i>`).join('')}</div>`;

// Web Audio API chime saat ada order masuk ke Driver (tanpa file audio eksternal)
function playChime(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(587.33,ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880,ctx.currentTime+0.12); // A5
    g.gain.setValueAtTime(0.35,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.55);
    osc.connect(g);g.connect(ctx.destination);
    osc.start();osc.stop(ctx.currentTime+0.55);
    if(navigator.vibrate)navigator.vibrate([150,80,150]);
  }catch{}
}

async function api(p,o={}){
  const r=await fetch('/api'+p,{method:o.m||'GET',headers:{'Content-Type':'application/json',...(S.token?{Authorization:'Bearer '+S.token}:{})},body:o.b?JSON.stringify(o.b):undefined});
  const j=r.status===204?{}:await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Terjadi kesalahan');
  return j;
}

function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.className='show';setTimeout(()=>t.className='',3200)}
function modal(h){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div>${h}</div>`;m.onclick=e=>{if(e.target===m)m.remove()};document.body.appendChild(m);return m}

function connect(){
  if(sock){sock.onclose=null;sock.close()}
  sock=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws?token='+S.token);
  sock.onmessage=e=>{try{const m=JSON.parse(e.data);S.ev(m.ev,m.data)}catch{}};
  sock.onclose=()=>S.token&&setTimeout(connect,3000);
}

function logout(){
  S.token=null;S.user=null;localStorage.removeItem('t');
  if(sock){sock.onclose=null;sock.close()}
  navigator.geolocation&&watch&&navigator.geolocation.clearWatch(watch);
  authView();
}

/* ──────────────────────────────────────────────────────────────────────
   LEAFLET & MAP ENGINE (OpenStreetMap + OSRM)
   ────────────────────────────────────────────────────────────────────── */
const ICON_COLORS = { Jemput: '#1d4ed8', Tujuan: '#ef4444', Driver: '#0f172a', Saya: '#16a34a' };

function makeIcon(color){
  return L.divIcon({
    className:'',
    html:`<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35)"></div>`,
    iconSize:[24,24],
    iconAnchor:[12,12]
  });
}

function initMap(){
  mk={};poly=null;
  if(map){map.remove();map=null}
  map=L.map('map',{zoomControl:true,attributionControl:true}).setView([-7.0513,110.438],15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);
  return true;
}

function setMk(key,pos,color){
  if(!map)return;
  const latlng=[pos.lat,pos.lng];
  const icon=makeIcon(ICON_COLORS[key]||color||'#1d4ed8');
  if(mk[key]){mk[key].setLatLng(latlng)}
  else{mk[key]=L.marker(latlng,{icon}).addTo(map)}
}

function delMk(key){
  if(mk[key]){mk[key].remove();delete mk[key]}
}

async function drawRoute(a,b){
  const e=await api('/maps/estimate',{m:'POST',b:{pickup:a,destination:b}});
  if(map){
    if(poly){poly.remove();poly=null}
    if(Array.isArray(e.polyline)&&e.polyline.length>=2){
      poly=L.polyline(e.polyline,{color:'#1d4ed8',weight:5.5,opacity:0.88,lineCap:'round'}).addTo(map);
      map.fitBounds(poly.getBounds(),{paddingBottomRight:[30,340],paddingTopLeft:[30,70]});
    }
  }
  return e;
}

/* ──────────────────────────────────────────────────────────────────────
   AUTH & REGISTRATION (Mahasiswa / Mitra Driver)
   ────────────────────────────────────────────────────────────────────── */
function authView(reg,defRole='customer'){
  let currentRole = defRole;
  const render=()=>{
    $('#app').innerHTML=`
    <div class="auth">
      <div>
        ${LOGO(68)}
        <h1 style="margin:12px 0 2px;font-size:28px;letter-spacing:-0.5px">ANJEM</h1>
        <p class="muted" style="margin-top:0">Antar Jemput Kampus · <i>“Gerak Cepat, Sampai Tepat.”</i></p>

        ${reg?`
        <div class="tab-group">
          <button class="tab-btn ${currentRole==='customer'?'on':''}" id="t_cust">🎓 Mahasiswa / Tamu</button>
          <button class="tab-btn ${currentRole==='driver'?'on':''}" id="t_drv">🛵 Mitra Driver</button>
        </div>
        <input id="n" placeholder="Nama lengkap">
        <input id="ph" placeholder="No. WhatsApp / HP">
        <input id="e" type="email" placeholder="Email kampus atau pribadi">
        <input id="p" type="password" placeholder="Password (min. 6 karakter)">
        ${currentRole==='driver'?`
        <div style="text-align:left;margin-top:8px">
          <small style="font-weight:700;color:var(--b)">Informasi Kendaraan Driver</small>
          <select id="vt" style="margin-top:4px">
            <option value="Motor">Sepeda Motor (Motor Kampus)</option>
            <option value="Mobil">Mobil Kampus</option>
          </select>
          <input id="vb" placeholder="Merk & Model (misal: Honda Beat 2022)">
          <input id="vp" placeholder="Nomor Plat (misal: H 1234 XY)">
        </div>`:''}
        `:`
        <input id="e" type="email" placeholder="Email terdaftar">
        <input id="p" type="password" placeholder="Password">
        `}

        <button class="btn" id="ok">${reg?(currentRole==='driver'?'Daftar Jadi Driver':'Daftar Mahasiswa'):'Masuk ke Akun'}</button>
        <button class="btn ghost" id="sw">${reg?'Sudah punya akun? Masuk':'Belum punya akun? Daftar'}</button>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--l);text-align:center">
          <small class="muted" style="display:block;margin-bottom:8px">⚡ Quick Login Demo (Klik untuk tes langsung):</small>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
            <button class="badge" style="cursor:pointer;border:0" id="qk_c">🎓 Budi (Customer)</button>
            <button class="badge green" style="cursor:pointer;border:0" id="qk_d">🛵 Rahmat (Driver)</button>
            <button class="badge orange" style="cursor:pointer;border:0" id="qk_a">🛡️ Admin</button>
          </div>
        </div>
      </div>
    </div>`;

    if(reg){
      $('#t_cust').onclick=()=>{currentRole='customer';render()};
      $('#t_drv').onclick=()=>{currentRole='driver';render()};
    }
    $('#sw').onclick=()=>authView(!reg,currentRole);

    $('#ok').onclick=async()=>{
      try{
        const b=reg?{
          name:$('#n')?.value,
          phone:$('#ph')?.value,
          email:$('#e')?.value,
          password:$('#p')?.value,
          role:currentRole,
          vehicle_type:$('#vt')?.value,
          brand:$('#vb')?.value,
          plate_number:$('#vp')?.value
        }:{
          email:$('#e')?.value,
          password:$('#p')?.value
        };
        const r=await api(reg?'/auth/register':'/auth/login',{m:'POST',b});
        S.token=r.token;S.user=r.user;localStorage.setItem('t',r.token);
        connect();route();
      }catch(e){toast(e.message)}
    };

    const qkLogin=async(email,password)=>{
      try{
        const r=await api('/auth/login',{m:'POST',b:{email,password}});
        S.token=r.token;S.user=r.user;localStorage.setItem('t',r.token);
        connect();route();
      }catch(e){toast(e.message)}
    };
    $('#qk_c').onclick=()=>qkLogin('customer1@anjem.test','password123');
    $('#qk_d').onclick=()=>qkLogin('driver1@anjem.test','password123');
    $('#qk_a').onclick=()=>qkLogin('admin@anjem.test','admin12345');
  };
  render();
}

const route=()=>({customer,driver,admin})[S.user.role]();

async function boot(){
  try{if(!S.token)throw 0;S.user=await api('/users/me');connect();route()}
  catch{S.token=null;localStorage.removeItem('t');authView()}
}

/* ──────────────────────────────────────────────────────────────────────
   NAVIGATION & PROFILE BAR
   ────────────────────────────────────────────────────────────────────── */
const topBar=()=>{
  const isD=S.user.role==='driver';
  return `
  <div class="top">
    <div class="top-brand">
      ${LOGO(24)}
      <span>ANJEM</span>
      <span class="badge ${isD?'green':''}" style="font-size:11px;padding:2px 8px">${isD?'Driver':'Kampus'}</span>
    </div>
    <div class="top-actions">
      <button id="quick_sw" title="Ganti role untuk demo">🔄 Akun</button>
      <button id="hist">Riwayat</button>
      <button id="prof">Profil</button>
    </div>
  </div>`;
};

function wireTop(){
  $('#quick_sw').onclick=()=>{
    modal(`
      <h3>Demo Switcher Akun</h3>
      <p class="muted">Pilih akun untuk menguji fitur customer atau driver secara instan:</p>
      <button class="btn" id="sw_c">🎓 Buka Sebagai Mahasiswa (Customer)</button>
      <button class="btn green" id="sw_d">🛵 Buka Sebagai Driver (Mitra Online)</button>
      <button class="btn ghost" id="sw_a">🛡️ Buka Sebagai Admin</button>
    `);
    const doSw=async(email,password)=>{
      try{
        document.querySelectorAll('.modal').forEach(m=>m.remove());
        const r=await api('/auth/login',{m:'POST',b:{email,password}});
        S.token=r.token;S.user=r.user;localStorage.setItem('t',r.token);
        connect();route();
      }catch(e){toast(e.message)}
    };
    $('#sw_c').onclick=()=>doSw('customer1@anjem.test','password123');
    $('#sw_d').onclick=()=>doSw('driver1@anjem.test','password123');
    $('#sw_a').onclick=()=>doSw('admin@anjem.test','admin12345');
  };

  $('#hist').onclick=async()=>{
    const h=await api('/history');
    modal(`<h3>Riwayat perjalanan</h3>${h.length?h.map(o=>`
      <div class="item">
        <div class="row"><b>${esc(o.destination_address)}</b><span class="badge">${ST[o.status]||o.status}</span></div>
        <small>${esc(o.created_at)} · ${o.distance_km} km · ${rp(o.final_price||o.estimated_price)}${o.my_rating?' · ⭐'+o.my_rating:''}</small>
      </div>`).join(''):'<p class="muted center">Belum ada perjalanan.</p>'}`);
  };

  $('#prof').onclick=async()=>{
    const isCust=S.user.role==='customer';
    let extra='';
    if(isCust){
      extra=`
      <div style="margin:14px 0;padding:14px;background:#f0fdf4;border:1.5px dashed #86efac;border-radius:16px;text-align:center">
        <b>🛵 Ingin dapat penghasilan tambahan?</b>
        <p class="muted" style="font-size:13px;margin:4px 0 10px">Daftarkan motormu menjadi Mitra Driver ANJEM Kampus.</p>
        <button class="btn green" id="upg_drv" style="margin:0">Daftar Jadi Mitra Driver</button>
      </div>`;
    }
    const m=modal(`
      <h3>Profil Pengguna</h3>
      <small>${esc(S.user.email)} · Role: <b>${esc(S.user.role)}</b></small>
      <input id="pn" value="${esc(S.user.name)}" placeholder="Nama">
      <input id="pp" value="${esc(S.user.phone)}" placeholder="No. HP">
      <button class="btn" id="sv">Simpan Profil</button>
      ${extra}
      <button class="btn red" id="lo">Keluar (Logout)</button>
    `);
    m.querySelector('#sv').onclick=async()=>{
      try{
        S.user=await api('/users/me',{m:'PATCH',b:{name:m.querySelector('#pn').value,phone:m.querySelector('#pp').value}});
        toast('Profil diperbarui');m.remove();
      }catch(e){toast(e.message)}
    };
    if(isCust&&m.querySelector('#upg_drv')){
      m.querySelector('#upg_drv').onclick=()=>{
        m.remove();
        const drvModal=modal(`
          <h3>Daftar Mitra Driver ANJEM</h3>
          <p class="muted">Masukkan informasi kendaraan motor/mobil kampus Anda:</p>
          <select id="uvt"><option value="Motor">Sepeda Motor</option><option value="Mobil">Mobil Kampus</option></select>
          <input id="uvb" placeholder="Merk & Model (misal: Honda Beat / Vario)">
          <input id="uvp" placeholder="Nomor Plat (misal: H 1234 XY)">
          <button class="btn green" id="btn_submit_drv">Konfirmasi & Aktifkan Driver</button>
        `);
        drvModal.querySelector('#btn_submit_drv').onclick=async()=>{
          try{
            const res=await api('/drivers/register',{
              m:'POST',
              b:{vehicle_type:drvModal.querySelector('#uvt').value,brand:drvModal.querySelector('#uvb').value,plate_number:drvModal.querySelector('#uvp').value}
            });
            S.token=res.token;S.user=res.user;localStorage.setItem('t',res.token);
            drvModal.remove();toast('Selamat! Anda sekarang adalah Mitra Driver ANJEM');
            driver();
          }catch(e){toast(e.message)}
        };
      };
    }
    m.querySelector('#lo').onclick=()=>{m.remove();logout()};
  };
}

const summary=o=>`
<div class="stats">
  <div><small>Jarak</small><b>${o.distance_km} km</b></div>
  <div><small>Estimasi</small><b>${o.estimated_duration} mnt</b></div>
  <div><small>Tarif</small><b>${rp(o.final_price||o.estimated_price)}</b></div>
</div>`;

const lst=(el,a,fn)=>{
  el.innerHTML=a.map((x,i)=>`<div class="item" data-i="${i}"><b>${esc(x.name||x.address)}</b><small>${esc(x.address)}</small></div>`).join('');
  el.onclick=e=>{const n=e.target.closest('.item');if(n)fn(a[n.dataset.i])};
};

/* ──────────────────────────────────────────────────────────────────────
   CUSTOMER SCREEN
   ────────────────────────────────────────────────────────────────────── */
async function customer(){
  $('#app').innerHTML='<div id="map"></div>'+topBar()+'<div class="sheet" id="sh"></div>';
  wireTop();C={};
  S.ev=(ev,d)=>{
    if(ev==='order:update')track(d);
    if(ev==='driver:location')setMk('Driver',d,'#0f172a');
  };
  initMap();
  const act=(await api('/orders?active=1'))[0];
  if(act)return track(act);
  home();
  setPickup(-7.0513,110.438);
  navigator.geolocation?.getCurrentPosition(p=>setPickup(p.coords.latitude,p.coords.longitude),()=>{},{enableHighAccuracy:true,timeout:8000});
  map?.on('click',async e=>{
    if(C.pick){
      C.pick=false;setPickup(e.latlng.lat,e.latlng.lng);
    }else if(!C.o&&C.pu){
      const lat=e.latlng.lat,lng=e.latlng.lng;
      setMk('Tujuan',{lat,lng},'#ef4444');
      toast('Menghitung rute ke titik peta…');
      let name=`${lat.toFixed(4)}, ${lng.toFixed(4)}`,addr=name;
      try{
        const g=await api(`/maps/geocode?lat=${lat}&lng=${lng}`);
        if(g.address){addr=g.address;name=addr.split(',')[0]||addr}
      }catch{}
      pick({name,address:addr,lat,lng});
    }
  });
}

const paint=()=>{const e=$('#pu');if(e)e.textContent=C.pu?C.pu.address:'Mendeteksi lokasi GPS…'};

async function setPickup(lat,lng){
  C.pu={lat,lng,address:'Mencari alamat…'};
  setMk('Jemput',C.pu,'#1d4ed8');
  map?.panTo([lat,lng]);
  paint();
  try{C.pu.address=(await api(`/maps/geocode?lat=${lat}&lng=${lng}`)).address}
  catch{C.pu.address=`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
  paint();
}

async function home(){
  C.o=null;
  if(poly){poly.remove();poly=null}
  delMk('Tujuan');delMk('Driver');
  $('#sh').innerHTML=`
    <div class="row"><b style="font-size:20px">Mau ke mana hari ini?</b><span class="badge">Kampus</span></div>
    <div class="loc"><span class="dot b"></span><div id="pu" class="grow"></div><button class="link" id="chg">Ubah Jemput</button></div>
    <input id="q" placeholder="Cari tujuan kampus atau ketuk langsung di peta…" autocomplete="off">
    <div id="res"></div>
    <p class="muted" id="rt"></p>
    <div id="rec"></div>`;
  paint();
  $('#chg').onclick=()=>{C.pick=true;toast('Ketuk titik mana saja di peta untuk posisi jemput')};
  let t;
  $('#q').oninput=e=>{
    clearTimeout(t);
    const v=e.target.value.trim();
    if(v.length<3)return($('#res').innerHTML='');
    t=setTimeout(async()=>{
      try{
        const c=C.pu||{lat:-7.0513,lng:110.438};
        lst($('#res'),await api(`/maps/search?q=${encodeURIComponent(v)}&lat=${c.lat}&lng=${c.lng}`),pick);
      }catch(e){toast(e.message)}
    },400);
  };
  try{const r=await api('/locations/recent');if(r.length){$('#rt').textContent='Tujuan terakhir';lst($('#rec'),r,pick)}}catch{}
}

async function pick(x){
  if(!C.pu)return toast('Lokasi jemput belum terdeteksi');
  setMk('Tujuan',x,'#ef4444');
  $('#sh').innerHTML='<p class="muted center" style="padding:20px 0"><span class="pulseGlow"></span>Menghitung rute & tarif terbaik…</p>';
  let e;
  try{e=await drawRoute(C.pu,x)}
  catch(er){toast(er.message);return home()}

  $('#sh').innerHTML=`
    <div class="row">
      <b style="font-size:18px">Konfirmasi Antar-Jemput</b>
      <span class="badge green">Rute Tercepat</span>
    </div>
    <div class="ride-card">
      <div class="ride-icon">🛵</div>
      <div class="grow">
        <b>ANJEM Motor Kampus</b>
        <small style="display:block;color:var(--g)">Driver standby di sekitar kampus</small>
      </div>
      <div class="ride-price">${rp(e.price)}</div>
    </div>
    <div class="loc"><span class="dot b"></span><div class="grow"><small>Titik Jemput</small><br>${esc(C.pu.address)}</div></div>
    <div class="loc"><span class="dot r"></span><div class="grow"><small>Titik Tujuan</small><br>${esc(x.name||x.address)}</div></div>
    ${summary(e)}
    <button class="btn" id="go">Pesan ANJEM Sekarang ➔</button>
    <button class="btn ghost" id="bk">Ganti Lokasi Tujuan</button>`;

  $('#bk').onclick=home;
  $('#go').onclick=async()=>{
    if(!confirm(`Konfirmasi pemesanan ANJEM seharga ${rp(e.price)}?`))return;
    try{track(await api('/orders',{m:'POST',b:{pickup:C.pu,destination:x}}))}
    catch(er){toast(er.message)}
  };
}

async function track(o){
  const first=!C.o||C.o.id!==o.id,s=o.status;C.o=o;
  const P={lat:o.pickup_latitude,lng:o.pickup_longitude},T={lat:o.destination_latitude,lng:o.destination_longitude};
  setMk('Jemput',P,'#1d4ed8');setMk('Tujuan',T,'#ef4444');
  if(o.driver_id&&o.dlat&&!['TRIP_COMPLETED','CANCELLED'].includes(s))setMk('Driver',{lat:o.dlat,lng:o.dlng},'#0f172a');
  if(first&&map)drawRoute(P,T).catch(()=>{});

  let h=`<div class="row"><b style="font-size:18px">${ST[s]||s}</b><span class="badge">#${o.id}</span></div>${bar(s)}`;
  if(s==='SEARCHING_DRIVER'){
    h+=`
    <div class="radar-wrap">
      <div class="radar-ring"></div>
      <div class="radar-ring"></div>
      <div class="radar-ring"></div>
      <div class="radar-center">🛵</div>
    </div>
    <p class="center muted" style="margin-top:4px">Menghubungkan ke driver ANJEM terdekat di kampus…</p>`;
  }else if(o.driver_name){
    h+=`
    <div class="card">
      <div class="av">${esc(o.driver_name[0])}</div>
      <div class="grow">
        <b>${esc(o.driver_name)}</b> ⭐ ${o.driver_rating}<br>
        <small>${esc(o.vehicle_type||'Motor')} · ${esc(o.brand||'')} (${esc(o.plate_number||'')})</small>
      </div>
      <a href="tel:${esc(o.driver_phone||'')}" class="badge green" style="text-decoration:none">Hubungi</a>
    </div>`;
  }
  h+=summary(o);
  if(['SEARCHING_DRIVER','DRIVER_ON_THE_WAY','DRIVER_ARRIVED'].includes(s))h+='<button class="btn red" id="cx">Batalkan Pesanan</button>';
  if(s==='TRIP_COMPLETED'){
    h+=`<p class="center" style="margin-top:16px"><b>Beri Penilaian Driver</b></p><div class="stars" id="st">${[1,2,3,4,5].map(n=>`<span data-n="${n}">★</span>`).join('')}</div><button class="btn" id="rate">Kirim Ulasan</button>`;
  }
  if(['TRIP_COMPLETED','CANCELLED'].includes(s))h+='<button class="btn ghost" id="done">Selesai & Pesan Lagi</button>';
  $('#sh').innerHTML=h;

  $('#cx')&&($('#cx').onclick=async()=>{
    if(confirm('Yakin ingin membatalkan pesanan ini?'))
      try{await api(`/orders/${o.id}/status`,{m:'PATCH',b:{status:'CANCELLED'}})}catch(e){toast(e.message)}
  });
  $('#done')&&($('#done').onclick=customer);
  if($('#st')){
    let r=0;
    $('#st').onclick=e=>{r=+e.target.dataset.n||r;[...$('#st').children].forEach((c,i)=>c.className=i<r?'on':'')};
    $('#rate').onclick=async()=>{
      if(!r)return toast('Pilih bintang rating terlebih dahulu');
      try{await api('/ratings',{m:'POST',b:{order_id:o.id,rating:r}});toast('Terima kasih atas penilaian Anda!');customer()}
      catch(e){toast(e.message)}
    };
  }
}

/* ──────────────────────────────────────────────────────────────────────
   DRIVER SCREEN
   ────────────────────────────────────────────────────────────────────── */
async function driver(){
  $('#app').innerHTML='<div id="map"></div>'+topBar()+'<div class="sheet" id="sh"></div>';
  wireTop();D={t:0,pend:[]};
  initMap();
  D.me=await api('/drivers/me');
  D.o=(await api('/orders?active=1'))[0];
  if(D.me.status==='AVAILABLE')D.pend=await api('/orders/pending');

  S.ev=(ev,d)=>{
    if(ev==='order:new'){
      playChime(); // Bunyikan nada lonceng
      D.pend=[d,...D.pend.filter(x=>x.id!==d.id)];
      toast('🔔 Order Baru Masuk! Ketuk untuk menerima');
      dpaint();
    }
    if(ev==='order:update'){
      if(d.driver_id===D.me.id)D.o=d;
      D.pend=D.pend.filter(x=>x.id!==d.id);
      if(['TRIP_COMPLETED','CANCELLED'].includes(d.status)){D.me.status='AVAILABLE'}
      dpaint();
    }
  };

  navigator.geolocation&&navigator.geolocation.clearWatch(watch);
  watch=navigator.geolocation?.watchPosition(
    p=>{
      D.pos={lat:p.coords.latitude,lng:p.coords.longitude};
      const f=!mk.Saya;setMk('Saya',D.pos,'#16a34a');
      if(f)map?.panTo([D.pos.lat,D.pos.lng]);
      if(Date.now()-D.t>4000){D.t=Date.now();api('/drivers/location',{m:'PATCH',b:D.pos}).catch(()=>{})}
    },
    ()=>toast('Aktifkan izin GPS lokasi untuk navigasi akurat'),
    {enableHighAccuracy:true}
  );
  dpaint();
}

const NEXT={
  DRIVER_ON_THE_WAY:['arrive','Sudah Sampai di Titik Jemput'],
  DRIVER_ARRIVED:['start','Mulai Perjalanan dengan Customer'],
  TRIP_STARTED:['complete','Selesaikan Perjalanan (Tiba di Tujuan)']
};

async function dpaint(){
  const o=D.o,me=D.me;let h='';
  if(o){
    const s=o.status,P={lat:o.pickup_latitude,lng:o.pickup_longitude},T={lat:o.destination_latitude,lng:o.destination_longitude};
    setMk('Jemput',P,'#1d4ed8');setMk('Tujuan',T,'#ef4444');
    const k=o.id+s;
    if(map&&D.rk!==k&&D.pos&&!['TRIP_COMPLETED','CANCELLED'].includes(s)){
      D.rk=k;drawRoute(s==='TRIP_STARTED'?P:D.pos,s==='TRIP_STARTED'?T:P).catch(e=>toast(e.message));
    }
    h=`
    <div class="row"><b style="font-size:18px">${ST[s]||s}</b><span class="badge">Order #${o.id}</span></div>
    ${bar(s)}
    <div class="card">
      <div class="av">${esc(o.customer_name[0])}</div>
      <div class="grow">
        <b>${esc(o.customer_name)}</b>
        <small style="display:block">Penumpang Kampus</small>
      </div>
    </div>
    <div class="loc"><span class="dot b"></span><div><small>Jemput</small><br>${esc(o.pickup_address)}</div></div>
    <div class="loc"><span class="dot r"></span><div><small>Tujuan</small><br>${esc(o.destination_address)}</div></div>
    ${summary(o)}`;

    if(NEXT[s])h+=`<button class="btn green" id="nx">${NEXT[s][1]} ➔</button>`;
    if(s==='TRIP_COMPLETED')h+=`<div class="card" style="background:#f0fdf4;border-color:#86efac"><div class="center grow"><b style="font-size:18px;color:#16a34a">Pendapatan Masuk: +${rp(o.final_price)}</b></div></div>`;
    if(['TRIP_COMPLETED','CANCELLED'].includes(s))h+='<button class="btn ghost" id="ok">Kembali ke Beranda Driver</button>';
    if(['DRIVER_ON_THE_WAY','DRIVER_ARRIVED'].includes(s))h+='<button class="btn red" id="cx">Batalkan Order</button>';
  }else{
    const on=me.status!=='OFFLINE';
    h=`
    <div class="row">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <b style="font-size:19px">${on?'Online':'Offline'}</b>
          <span class="badge ${on?'green':''}">${on?'Siap Antar Penumpang':'Istirahat'}</span>
        </div>
        <small class="muted">${esc(me.brand||'Motor')} · ${esc(me.plate_number||'')}</small>
      </div>
      <label class="switch"><input type="checkbox" id="tg" ${on?'checked':''}><span></span></label>
    </div>
    <div class="stats">
      <div><small>Pendapatan</small><b>${rp(me.earnings)}</b></div>
      <div><small>Trip Sukses</small><b>${me.trips}</b></div>
      <div><small>Rating</small><b>⭐ ${me.rating}</b></div>
    </div>`;

    if(on){
      if(D.pend.length){
        h+=D.pend.map(p=>`
        <div class="order-alert">
          <div class="row"><b style="color:var(--b)">⚡ Orderan Kampus Baru!</b><span class="badge green">${p.distance_km} km</span></div>
          <div class="loc"><span class="dot b"></span><div><small>Titik Jemput</small><br><b>${esc(p.pickup_address)}</b></div></div>
          <div class="loc"><span class="dot r"></span><div><small>Tujuan</small><br><b>${esc(p.destination_address)}</b></div></div>
          ${summary(p)}
          <div class="row" style="margin-top:10px">
            <button class="btn red" style="flex:1" data-r="${p.id}">Tolak</button>
            <button class="btn green" style="flex:2" data-a="${p.id}">✓ Terima Pesanan</button>
          </div>
        </div>`).join('');
      }else{
        h+=`
        <div class="radar-wrap">
          <div class="radar-ring"></div>
          <div class="radar-ring"></div>
          <div class="radar-center">📡</div>
        </div>
        <p class="center muted" style="margin-top:4px">Menunggu orderan dari civitas akademika…</p>`;
      }
    }else{
      h+='<p class="center muted" style="padding:24px 0">Aktifkan tombol switch di atas untuk mulai menerima pesanan antar-jemput kampus.</p>';
    }
  }
  $('#sh').innerHTML=h;

  const act=async(f)=>{try{await f()}catch(e){toast(e.message)}};
  $('#tg')&&($('#tg').onchange=e=>act(async()=>{
    await api('/drivers/status',{m:'PATCH',b:{status:e.target.checked?'ONLINE':'OFFLINE'}});
    D.me=await api('/drivers/me');
    D.pend=e.target.checked?await api('/orders/pending'):[];
    dpaint();
  }));
  $('#nx')&&($('#nx').onclick=()=>act(async()=>{D.o=await api(`/orders/${o.id}/${NEXT[o.status][0]}`,{m:'POST'});dpaint()}));
  $('#cx')&&($('#cx').onclick=()=>confirm('Batalkan order ini?')&&act(()=>api(`/orders/${o.id}/status`,{m:'PATCH',b:{status:'CANCELLED'}})));
  $('#ok')&&($('#ok').onclick=()=>driver());

  document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>act(async()=>{
    D.o=await api(`/orders/${b.dataset.a}/accept`,{m:'POST'});
    D.me.status='BUSY';D.pend=[];D.rk=null;dpaint();
  }));
  document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{
    D.pend=D.pend.filter(x=>x.id!=b.dataset.r);dpaint();
  });
}

/* ──────────────────────────────────────────────────────────────────────
   ADMIN SCREEN
   ────────────────────────────────────────────────────────────────────── */
async function admin(){
  $('#app').innerHTML=`
  <div class="adm">
    <header>
      <div class="brand">${LOGO(32)}<b>ANJEM</b> <span class="badge">Panel Admin</span></div>
      <nav id="nav">${['Dashboard','Users','Drivers','Orders','Tariffs'].map(t=>`<button data-t="${t}">${t}</button>`).join('')}</nav>
      <button class="link" id="lo">Keluar</button>
    </header>
    <main id="mn"></main>
  </div>`;
  $('#lo').onclick=logout;S.ev=()=>{};
  $('#nav').onclick=e=>e.target.dataset.t&&tab(e.target.dataset.t);
  tab('Dashboard');
}

const tbl=(c,r)=>`<div class="tw"><table><tr>${c.map(x=>`<th>${x[0]}</th>`).join('')}</tr>${r.map(x=>`<tr>${c.map(k=>`<td>${k[1](x)}</td>`).join('')}</tr>`).join('')}</table></div>`;

async function tab(t){
  document.querySelectorAll('#nav button').forEach(b=>b.className=b.dataset.t===t?'on':'');
  const m=$('#mn');m.innerHTML='<p class="muted">Memuat data…</p>';
  try{
    if(t==='Dashboard'){
      const s=await api('/admin/stats'),mx=k=>Math.max(1,...s.daily.map(d=>d[k]));
      const K=[['Customer',s.customers],['Driver',s.drivers],['Driver Online',s.online],['Order Aktif',s.active],['Order Selesai',s.completed],['Pendapatan Total',rp(s.revenue)]];
      const ch=(k,f)=>`<div class="bars">${s.daily.map(d=>`<div><i style="height:${(d[k]/mx(k))*100}px"></i>${f(d[k])}<br>${d.day.slice(5)}</div>`).join('')}</div>`;
      m.innerHTML=`
      <div class="grid">${K.map(k=>`<div class="kpi"><small>${k[0]}</small><b>${k[1]}</b></div>`).join('')}</div>
      <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <div class="panel"><b>Order 7 Hari Terakhir</b>${ch('orders',v=>v)}</div>
        <div class="panel"><b>Pendapatan 7 Hari Terakhir</b>${ch('revenue',v=>v/1000+'k')}</div>
      </div>`;
    }else if(t==='Users'){
      m.innerHTML=`<div class="panel">${tbl([['Nama',x=>esc(x.name)],['Email',x=>esc(x.email)],['HP',x=>esc(x.phone)],['Role',x=>x.role],['Daftar',x=>x.created_at]],await api('/admin/users'))}</div>`;
    }else if(t==='Drivers'){
      m.innerHTML=`<div class="panel">${tbl([['Nama',x=>esc(x.name)],['Kendaraan',x=>esc(x.brand+' · '+x.plate_number)],['Status',x=>x.status],['Rating',x=>'⭐ '+x.rating],['Akun',x=>`<button class="link" data-id="${x.id}" data-a="${x.is_active?0:1}">${x.is_active?'Aktif · Nonaktifkan':'Nonaktif · Aktifkan'}</button>`]],await api('/admin/drivers'))}</div>`;
      m.onclick=async e=>{const id=e.target.dataset.id;if(id){await api(`/admin/drivers/${id}/active`,{m:'PATCH',b:{active:+e.target.dataset.a===1}});tab('Drivers')}};
    }else if(t==='Orders'){
      m.innerHTML=`<div class="panel">${tbl([['#',x=>x.id],['Customer',x=>esc(x.customer)],['Driver',x=>esc(x.driver||'-')],['Tujuan',x=>esc(x.destination_address)],['Km',x=>x.distance_km],['Tarif',x=>rp(x.final_price||x.estimated_price)],['Status',x=>ST[x.status]||x.status]],await api('/admin/orders'))}</div>`;
    }else{
      const f=await api('/tariffs'),F=[['base_fare','Tarif dasar (Rp)'],['price_per_km','Tarif per km (Rp)'],['minimum_fare','Tarif minimum (Rp)'],['radius_km','Radius layanan (km)']];
      m.innerHTML=`
      <div class="panel" style="max-width:440px">
        <b>Pengaturan Tarif Kampus</b>
        ${F.map(([k,l])=>`<small style="margin-top:8px;display:block">${l}</small><input id="f_${k}" type="number" min="0" value="${f[k]}">`).join('')}
        <small class="muted" style="display:block;margin:6px 0">Rumus: tarif dasar + jarak × tarif/km, dibulatkan ke atas per Rp500.</small>
        <button class="btn" id="sv">Simpan Perubahan Tarif</button>
      </div>`;
      $('#sv').onclick=async()=>{
        try{
          await api('/tariffs',{m:'PATCH',b:Object.fromEntries(F.map(([k])=>[k,$('#f_'+k).value]))});
          toast('Tarif kampus berhasil diperbarui');
        }catch(e){toast(e.message)}
      };
    }
  }catch(e){m.innerHTML='<p class="muted">'+esc(e.message)+'</p>'}
}

/* ──────────────────────────────────────────────────────────────────────
   BOOTSTRAP & SPLASH
   ────────────────────────────────────────────────────────────────────── */
$('#app').innerHTML=`
<div class="splash">
  <div>
    ${LOGO(84)}
    <h1 style="margin:12px 0 4px;font-size:38px;letter-spacing:-1px">ANJEM</h1>
    <p style="opacity:.92;font-size:15px;margin-top:0">Gerak Cepat, Sampai Tepat.</p>
    <div style="margin-top:20px"><small style="opacity:.75">Memuat sistem antar-jemput kampus…</small></div>
  </div>
</div>`;
setTimeout(boot,850);
