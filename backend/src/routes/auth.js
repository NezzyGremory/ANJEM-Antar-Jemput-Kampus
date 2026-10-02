const r=require('express').Router(),bcrypt=require('bcryptjs'),db=require('../db'),{sign}=require('../services/auth'),{bad}=require('../utils/http');

r.post('/register',(q,s)=>{
  const{name,email,password,phone,role,vehicle_type,brand,plate_number}=q.body||{};
  if(!name||String(name).length<2||!/^\S+@\S+\.\S+$/.test(email||'')||String(password||'').length<6){
    throw bad('Nama, email valid, dan password minimal 6 karakter wajib diisi');
  }
  const em=email.toLowerCase().trim();
  if(db.prepare('select 1 from users where email=?').get(em))throw bad('Email sudah terdaftar',409);
  
  const userRole = role === 'driver' ? 'driver' : 'customer';
  if(userRole === 'driver' && (!brand || !plate_number)){
    throw bad('Untuk pendaftaran Mitra Driver, merk kendaraan dan plat nomor wajib diisi');
  }

  const u = db.transaction(()=>{
    const uid = db.prepare("insert into users(name,email,password_hash,phone,role) values(?,?,?,?,?)")
      .run(String(name).slice(0,80), em, bcrypt.hashSync(password,10), String(phone||'').slice(0,20), userRole).lastInsertRowid;
    
    if(userRole === 'driver'){
      const did = db.prepare("insert into drivers(user_id,status,current_latitude,current_longitude,rating,is_active) values(?,'AVAILABLE',-7.0513,110.438,5.0,1)").run(uid).lastInsertRowid;
      const vid = db.prepare('insert into vehicles(driver_id,vehicle_type,brand,plate_number) values(?,?,?,?)').run(did, vehicle_type || 'Motor', String(brand).slice(0,50), String(plate_number).slice(0,20).toUpperCase()).lastInsertRowid;
      db.prepare('update drivers set vehicle_id=? where id=?').run(vid, did);
    }
    return db.prepare('select id,name,email,phone,role from users where id=?').get(uid);
  })();

  s.status(201).json({token:sign(u),user:u});
});

r.post('/login',(q,s)=>{
  const{email,password}=q.body||{};
  const u=db.prepare('select * from users where email=?').get(String(email||'').toLowerCase().trim());
  if(!u||!bcrypt.compareSync(String(password||''),u.password_hash))throw bad('Email atau password salah',401);
  if(u.role==='driver'&&!db.prepare('select is_active from drivers where user_id=?').get(u.id)?.is_active)throw bad('Akun driver dinonaktifkan',403);
  delete u.password_hash;
  s.json({token:sign(u),user:u});
});

module.exports=r;
