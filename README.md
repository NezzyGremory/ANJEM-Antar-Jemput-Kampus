# ANJEM – Antar Jemput Kampus
*Gerak Cepat, Sampai Tepat.* Platform antar-jemput digital khusus lingkungan kampus (prototype MVP).

**Stack:** Node.js 18+ · Express · SQLite (better-sqlite3) · WebSocket (ws) · JWT + bcrypt · Frontend vanilla JS (mobile-first) · Google Maps Platform.

## Instalasi & menjalankan
```bash
npm install
cp .env.example .env      # lalu isi GOOGLE_MAPS_API_KEY dan JWT_SECRET
npm start                 # http://localhost:3000  (database + seed demo dibuat otomatis)
```
Reset data demo: hapus `database/anjem.db*` lalu `npm start`.

## Google Maps API key
1. Buat project di Google Cloud Console, aktifkan: **Maps JavaScript API, Routes API, Places API (New), Geocoding API**.
2. Buat API key, isi di `.env`: `GOOGLE_MAPS_API_KEY=...` lalu restart server.
3. Rute, pencarian tempat, dan geocoding dipanggil dari **server** (key tidak dikirim ke klien untuk layanan ini). Hanya Maps JavaScript yang memuat key di browser, jadi **batasi key dengan HTTP referrer** (atau pakai 2 key terpisah).
4. Lokasi jemput otomatis dari GPS browser (butuh HTTPS atau `localhost`); bisa diubah dengan tombol "Ubah" lalu ketuk peta.

## Akun demo
| Role | Email | Password |
|---|---|---|
| Admin | admin@anjem.test | admin12345 |
| Customer | customer1@anjem.test | password123 |
| Driver | driver1@anjem.test … driver3 | password123 |

**Mencoba flow:** buka dua browser/tab (customer & driver). Driver login → toggle Online → customer pilih tujuan → Pesan ANJEM → driver terima → Sudah Sampai → Mulai → Selesaikan → customer beri rating.

## Struktur
```
backend/src/{config,db,server}.js   routes/ (auth, orders, drivers, maps, admin, misc)
            services/ (auth, google, realtime, trip)   utils/ (geo, http)
database/   schema.sql, seed.js
frontend/   index.html, style.css, app.js
```

## Aturan
- Tarif: `total = max(minimum_fare, base_fare + km × price_per_km)`, dibulatkan ke atas per Rp500. Diatur admin (tab Tariffs), termasuk radius layanan.
- Status order: `SEARCHING_DRIVER → DRIVER_ON_THE_WAY → DRIVER_ARRIVED → TRIP_STARTED → TRIP_COMPLETED` (atau `CANCELLED`; `DRIVER_ASSIGNED` tersedia di enum dan UI).
- Matching: order dikirim via WebSocket ke 5 driver `AVAILABLE` terdekat; driver pertama yang menerima menang (atomic). Driver menjadi `BUSY`, kembali `AVAILABLE` saat selesai.

## API (prefix `/api`, header `Authorization: Bearer <token>`)
| Method | Endpoint | Role |
|---|---|---|
| POST | /auth/register, /auth/login | publik |
| GET/PATCH | /users/me | semua |
| GET | /maps/search?q=&lat=&lng= · /maps/geocode?lat=&lng= | login |
| POST | /maps/estimate `{pickup,destination}` | login |
| GET | /drivers/nearby?lat=&lng= | login |
| GET | /drivers/me | driver |
| PATCH | /drivers/status `{status:ONLINE\|OFFLINE}` · /drivers/location `{lat,lng}` | driver |
| POST | /orders `{pickup,destination}` | customer |
| GET | /orders (?active=1) · /orders/pending · /orders/:id | login |
| POST | /orders/:id/accept · /reject · /arrive · /start · /complete | driver |
| PATCH | /orders/:id/status `{status:CANCELLED}` | customer/driver |
| POST | /ratings `{order_id,rating,review}` | customer |
| GET | /history · /locations/recent | customer/driver |
| GET/PATCH | /tariffs | login / admin |
| GET | /admin/stats · /admin/users · /admin/drivers · /admin/orders | admin |
| PATCH | /admin/drivers/:id/active `{active}` | admin |

Kode status: 200/201/204 sukses, 400 validasi, 401 belum login, 403 akses ditolak, 404, 409 konflik status, 422 di luar radius/rute tidak ada, 503 API key belum diisi.
WebSocket: `/ws?token=<jwt>` — event `order:new`, `order:update`, `driver:location`.

## Pengembangan lanjutan
Halaman admin Vehicles/Reports/Settings terpisah (kendaraan saat ini tampil di tab Drivers), pembayaran digital, timeout & re-dispatch otomatis, chat, promo.
