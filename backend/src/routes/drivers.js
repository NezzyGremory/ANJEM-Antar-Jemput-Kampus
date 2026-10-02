const r=require('express').Router(),db=require('../db'),{auth,sign}=require('../services/auth'),rt=require('../services/realtime'),{km}=require('../utils/geo'),{bad,pt}=require('../utils/http');

const drv=u=>db.prepare('select * from drivers where user_id=?').get(u.id);

r.get('/me',auth('driver'),(q,s)=>{
  const d=drv(q.user);
  if(!d)throw bad('Profil driver tidak ditemukan',404);
  const t=db.prepare("select count(*) trips,coalesce(sum(final_price),0) earnings from orders where driver_id=? and status='TRIP_COMPLETED'").get(d.id);
  const v=db.prepare('select vehicle_type,brand,plate_number from vehicles where id=?').get(d.vehicle_id);
  s.json({...d,...t,...v,name:q.user.name,email:q.user.email,phone:q.user.phone});
});

// Upgrade akun customer yang sudah login menjadi driver
r.post('/register',auth('customer'),(q,s)=>{
  const{vehicle_type,brand,plate_number}=q.body||{};
  if(!brand||!plate_number)throw bad('Merk kendaraan dan nomor plat wajib diisi');
  
  db.transaction(()=>{
    db.prepare("update users set role='driver' where id=?").run(q.user.id);
    const did=db.prepare("insert into drivers(user_id,status,current_latitude,current_longitude,rating,is_active) values(?,'AVAILABLE',-7.0513,110.438,5.0,1)").run(q.user.id).lastInsertRowid;
    const vid=db.prepare('insert into vehicles(driver_id,vehicle_type,brand,plate_number) values(?,?,?,?)').run(did,vehicle_type||'Motor',String(brand).slice(0,50),String(plate_number).slice(0,20).toUpperCase()).lastInsertRowid;
    db.prepare('update drivers set vehicle_id=? where id=?').run(vid,did);
  })();

  const u=db.prepare('select id,name,email,phone,role from users where id=?').get(q.user.id);
  s.json({ok:true,user:u,token:sign(u)});
});

r.patch('/status',auth('driver'),(q,s)=>{
  const d=drv(q.user),st={ONLINE:'AVAILABLE',OFFLINE:'OFFLINE'}[q.body?.status];
  if(!st)throw bad('Status harus ONLINE atau OFFLINE');
  if(!d.is_active)throw bad('Akun driver nonaktif',403);
  if(d.status==='BUSY')throw bad('Selesaikan perjalanan terlebih dahulu',409);
  
  // Jika online dan belum ada koordinat, set default kampus
  if(st==='AVAILABLE' && (d.current_latitude==null || d.current_longitude==null)){
    db.prepare('update drivers set status=?,current_latitude=?,current_longitude=? where id=?').run(st,-7.0513,110.438,d.id);
  } else {
    db.prepare('update drivers set status=? where id=?').run(st,d.id);
  }
  s.json({status:st});
});

r.patch('/location',auth('driver'),(q,s)=>{
  if(!pt(q.body))throw bad('Koordinat tidak valid');
  const d=drv(q.user);
  db.prepare('update drivers set current_latitude=?,current_longitude=? where id=?').run(q.body.lat,q.body.lng,d.id);
  const o=db.prepare("select customer_id from orders where driver_id=? and status in('DRIVER_ON_THE_WAY','DRIVER_ARRIVED','TRIP_STARTED')").get(d.id);
  if(o)rt.toUser(o.customer_id,'driver:location',{lat:q.body.lat,lng:q.body.lng});
  s.status(204).end();
});

r.get('/nearby',auth(),(q,s)=>{
  const lat=+q.query.lat,lng=+q.query.lng;
  if(!pt({lat,lng}))throw bad('Koordinat tidak valid');
  s.json(db.prepare("select d.id,u.name,d.rating,coalesce(d.current_latitude,-7.0513) lat,coalesce(d.current_longitude,110.438) lng,v.brand,v.plate_number from drivers d join users u on u.id=d.user_id left join vehicles v on v.id=d.vehicle_id where d.status='AVAILABLE' and d.is_active=1").all()
  .map(d=>({...d,distance_km:+km(lat,lng,d.lat,d.lng).toFixed(2)})).sort((a,b)=>a.distance_km-b.distance_km).slice(0,10));
});

module.exports=r;
