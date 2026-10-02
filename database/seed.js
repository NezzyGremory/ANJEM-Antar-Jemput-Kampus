const bcrypt=require('bcryptjs');const db=require('../backend/src/db');
function seed(){
if(db.prepare('select count(*) n from users').get().n)return false;
const h=bcrypt.hashSync('password123',10),u=db.prepare('insert into users(name,email,password_hash,phone,role) values(?,?,?,?,?)');
u.run('Admin ANJEM','admin@anjem.test',bcrypt.hashSync('admin12345',10),'081200000000','admin');
const cust=['Budi Santoso','Sari Dewi','Andi Pratama'].map((n,i)=>u.run(n,`customer${i+1}@anjem.test`,h,`08120000010${i}`,'customer').lastInsertRowid);
const drv=[['Rahmat','Honda Beat','K 1234 AB',-7.0518,110.4392],['Joko','Yamaha NMAX','K 2345 CD',-7.0501,110.437],['Dimas','Honda Vario','K 3456 EF',-7.053,110.4405]].map(([n,b,p,la,lo],i)=>{
const uid=u.run(n,`driver${i+1}@anjem.test`,h,`08130000010${i}`,'driver').lastInsertRowid;
const did=db.prepare("insert into drivers(user_id,status,current_latitude,current_longitude) values(?,'OFFLINE',?,?)").run(uid,la,lo).lastInsertRowid;
const vid=db.prepare('insert into vehicles(driver_id,vehicle_type,brand,plate_number) values(?,?,?,?)').run(did,'Motor',b,p).lastInsertRowid;
db.prepare('update drivers set vehicle_id=? where id=?').run(vid,did);return did});
db.prepare('insert into tariffs(base_fare,price_per_km,minimum_fare,radius_km) values(5000,2000,8000,15)').run();
const ins=db.prepare("insert into orders(customer_id,driver_id,pickup_latitude,pickup_longitude,pickup_address,destination_latitude,destination_longitude,destination_address,distance_km,estimated_duration,estimated_price,final_price,status,created_at,completed_at) values(?,?,?,?,?,?,?,?,?,?,?,?,'TRIP_COMPLETED',datetime('now',?),datetime('now',?))");
[[0,0,'Gerbang Utama Kampus','Fakultas Teknik',2.4,8,10000,'-6 day',5],[1,1,'Perpustakaan Pusat','Asrama Mahasiswa',1.8,6,9000,'-4 day',4],[2,2,'Fakultas Ekonomi','Kantin Pusat',1.1,4,8000,'-2 day',5],[0,1,'Asrama Mahasiswa','Gerbang Utama Kampus',3.1,10,11500,'-1 day',5]].forEach(([c,d,a,b,km,mn,pr,off,rt])=>{
const id=ins.run(cust[c],drv[d],-7.0513,110.438,a,-7.0561,110.4412,b,km,mn,pr,pr,off,off).lastInsertRowid;
db.prepare("insert into payments(order_id,amount) values(?,?)").run(id,pr);
db.prepare('insert into ratings(order_id,customer_id,driver_id,rating,review) values(?,?,?,?,?)').run(id,cust[c],drv[d],rt,'Driver ramah dan tepat waktu');});
return true}
module.exports=seed;
if(require.main===module)console.log(seed()?'Seed berhasil':'Database sudah berisi data');
