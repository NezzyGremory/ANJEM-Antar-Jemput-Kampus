const r=require('express').Router(),bcrypt=require('bcryptjs'),db=require('../db'),{sign}=require('../services/auth'),{bad}=require('../utils/http');

// NIM login helper — converts NIM to internal email format
const nimToEmail = nim => `${String(nim).trim()}@anjem.local`;
const isNIM = v => /^\d{5,12}$/.test(String(v||'').trim());
const isEmail = v => /^\S+@\S+\.\S+$/.test(String(v||'').trim());

r.post('/register',(q,s)=>{
  const{name,nim,password,phone,role,vehicle_type,brand,plate_number}=q.body||{};
  const nimStr = String(nim||'').trim();
  if(!name||String(name).length<2)throw bad('Nama wajib diisi (minimal 2 karakter)');
  if(!isNIM(nimStr))throw bad('NIM harus berupa angka 5-12 digit (contoh: 60124030)');
  if(String(password||'').length<6)throw bad('Password minimal 6 karakter');

  const em = nimToEmail(nimStr);
  if(db.prepare('select 1 from users where email=?').get(em))throw bad('NIM sudah terdaftar',409);

  const userRole = role==='driver'?'driver':'customer';
  if(userRole==='driver'&&(!brand||!plate_number))throw bad('Merk kendaraan dan nomor plat wajib diisi untuk Driver');

  const u=db.transaction(()=>{
    const uid=db.prepare("insert into users(name,email,password_hash,phone,role) values(?,?,?,?,?)")
      .run(String(name).slice(0,80),em,bcrypt.hashSync(password,10),String(phone||'').slice(0,20),userRole).lastInsertRowid;
    if(userRole==='driver'){
      const did=db.prepare("insert into drivers(user_id,status,current_latitude,current_longitude,rating,is_active) values(?,'AVAILABLE',-7.0513,110.438,5.0,1)").run(uid).lastInsertRowid;
      const vid=db.prepare('insert into vehicles(driver_id,vehicle_type,brand,plate_number) values(?,?,?,?)').run(did,vehicle_type||'Motor',String(brand).slice(0,50),String(plate_number).slice(0,20).toUpperCase()).lastInsertRowid;
      db.prepare('update drivers set vehicle_id=? where id=?').run(vid,did);
    }
    return db.prepare('select id,name,email,phone,role from users where id=?').get(uid);
  })();

  s.status(201).json({token:sign(u),user:{...u,nim:nimStr}});
});

r.post('/login',(q,s)=>{
  const{nim,password}=q.body||{};
  const nimStr=String(nim||'').trim();
  // Support login dengan NIM (angka) atau email lengkap (untuk admin)
  let em;
  if(isNIM(nimStr)) em=nimToEmail(nimStr);
  else if(isEmail(nimStr)) em=nimStr.toLowerCase();
  else throw bad('Masukkan NIM (angka) atau email yang valid',400);

  const u=db.prepare('select * from users where email=?').get(em);
  if(!u||!bcrypt.compareSync(String(password||''),u.password_hash))throw bad('NIM atau password salah',401);
  if(u.role==='driver'&&!db.prepare('select is_active from drivers where user_id=?').get(u.id)?.is_active)throw bad('Akun driver dinonaktifkan oleh Admin',403);
  const nimVal = u.email.endsWith('@anjem.local')?u.email.split('@')[0]:null;
  delete u.password_hash;
  s.json({token:sign(u),user:{...u,nim:nimVal}});
});

module.exports=r;
