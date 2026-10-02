const r=require('express').Router(),db=require('../db'),{auth}=require('../services/auth'),rt=require('../services/realtime'),trip=require('../services/trip'),{km}=require('../utils/geo'),{w,bad,pt}=require('../utils/http');
const SQL=`select o.*,cu.name customer_name,du.name driver_name,du.phone driver_phone,v.brand,v.vehicle_type,v.plate_number,d.rating driver_rating,d.current_latitude dlat,d.current_longitude dlng,d.user_id driver_user_id from orders o join users cu on cu.id=o.customer_id left join drivers d on d.id=o.driver_id left join users du on du.id=d.user_id left join vehicles v on v.id=d.vehicle_id`;
const get=id=>db.prepare(SQL+' where o.id=?').get(id);
const push=o=>{rt.toUser(o.customer_id,'order:update',o);if(o.driver_user_id)rt.toUser(o.driver_user_id,'order:update',o);return o};
const ACT="'SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ON_THE_WAY','DRIVER_ARRIVED','TRIP_STARTED'";
const drv=u=>db.prepare('select * from drivers where user_id=?').get(u.id);
r.get('/',auth(),(q,s)=>{const u=q.user;let wh='1=1',a=[];
if(u.role==='customer'){wh='o.customer_id=?';a=[u.id]}else if(u.role==='driver'){wh='o.driver_id=?';a=[drv(u).id]}
if(q.query.active)wh+=` and o.status in (${ACT})`;s.json(db.prepare(`${SQL} where ${wh} order by o.id desc limit 100`).all(...a))});
r.get('/pending',auth('driver'),(q,s)=>s.json(db.prepare(`${SQL} where o.status='SEARCHING_DRIVER' order by o.id desc limit 10`).all()));
r.get('/:id',auth(),(q,s)=>{const o=get(q.params.id),u=q.user;
if(!o||(u.role==='customer'&&o.customer_id!==u.id)||(u.role==='driver'&&o.driver_user_id!==u.id))throw bad('Order tidak ditemukan',404);s.json(o)});
r.post('/',auth('customer'),w(async(q,s)=>{const{pickup,destination}=q.body||{};
if(!pt(pickup)||!pt(destination))throw bad('Lokasi tidak valid');
if(db.prepare(`select 1 from orders where customer_id=? and status in (${ACT})`).get(q.user.id))throw bad('Masih ada pesanan aktif',409);
const e=await trip.estimate(pickup,destination),T=x=>String(x||'').slice(0,200);
const id=db.prepare("insert into orders(customer_id,pickup_latitude,pickup_longitude,pickup_address,destination_latitude,destination_longitude,destination_address,distance_km,estimated_duration,estimated_price,status) values(?,?,?,?,?,?,?,?,?,?,'SEARCHING_DRIVER')").run(q.user.id,pickup.lat,pickup.lng,T(pickup.address),destination.lat,destination.lng,T(destination.address),e.distance_km,e.duration_min,e.price).lastInsertRowid;
db.prepare('insert into locations(user_id,label,address,latitude,longitude) values(?,?,?,?,?)').run(q.user.id,T(destination.name),T(destination.address),destination.lat,destination.lng);
const o=get(id);// matching sederhana: 5 driver AVAILABLE terdekat dari titik jemput
db.prepare("select user_id,current_latitude la,current_longitude lo from drivers where status='AVAILABLE' and is_active=1").all()
.map(d=>({...d,k:(d.la!=null&&d.lo!=null)?km(pickup.lat,pickup.lng,d.la,d.lo):0.5})).sort((a,b)=>a.k-b.k).slice(0,10).forEach(d=>rt.toUser(d.user_id,'order:new',o));
s.status(201).json(o)}));
r.post('/:id/accept',auth('driver'),(q,s)=>{const d=drv(q.user);
if(!d.is_active)throw bad('Akun driver nonaktif',403);if(d.status!=='AVAILABLE')throw bad('Driver tidak tersedia (offline/sibuk)',409);
const ok=db.transaction(()=>{if(!db.prepare("update orders set driver_id=?,status='DRIVER_ON_THE_WAY' where id=? and status='SEARCHING_DRIVER'").run(d.id,q.params.id).changes)return false;
db.prepare("update drivers set status='BUSY' where id=?").run(d.id);return true})();
if(!ok)throw bad('Order sudah diambil driver lain',409);s.json(push(get(q.params.id)))});
r.post('/:id/reject',auth('driver'),(q,s)=>s.status(204).end());
const step=(p,from,to)=>r.post('/:id/'+p,auth('driver'),(q,s)=>{const d=drv(q.user),done=to==='TRIP_COMPLETED';
const x=db.prepare(`update orders set status=?${done?",final_price=estimated_price,completed_at=datetime('now')":''} where id=? and driver_id=? and status=?`).run(to,q.params.id,d.id,from);
if(!x.changes)throw bad('Status order tidak valid',409);
if(done){db.prepare("update drivers set status='AVAILABLE' where id=?").run(d.id);const o=get(q.params.id);db.prepare('insert into payments(order_id,amount) values(?,?)').run(o.id,o.final_price)}
s.json(push(get(q.params.id)))});
step('arrive','DRIVER_ON_THE_WAY','DRIVER_ARRIVED');step('start','DRIVER_ARRIVED','TRIP_STARTED');step('complete','TRIP_STARTED','TRIP_COMPLETED');
r.patch('/:id/status',auth('customer','driver'),(q,s)=>{if(q.body?.status!=='CANCELLED')throw bad('Gunakan endpoint accept/arrive/start/complete untuk status lain');
const o=get(q.params.id);if(!o)throw bad('Order tidak ditemukan',404);
if(!(q.user.role==='customer'?o.customer_id===q.user.id:o.driver_user_id===q.user.id))throw bad('Akses ditolak',403);
if(!['SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ON_THE_WAY','DRIVER_ARRIVED'].includes(o.status))throw bad('Order tidak bisa dibatalkan',409);
db.prepare("update orders set status='CANCELLED' where id=?").run(o.id);if(o.driver_id)db.prepare("update drivers set status='AVAILABLE' where id=?").run(o.driver_id);
s.json(push(get(o.id)))});
module.exports=r;
