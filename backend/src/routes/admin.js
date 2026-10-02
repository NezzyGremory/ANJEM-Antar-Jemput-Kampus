const r=require('express').Router(),db=require('../db'),{auth}=require('../services/auth'),{bad}=require('../utils/http');
r.use(auth('admin'));
const n=q=>db.prepare(q).get().n;
r.get('/stats',(q,s)=>s.json({customers:n("select count(*) n from users where role='customer'"),drivers:n('select count(*) n from drivers'),online:n("select count(*) n from drivers where status!='OFFLINE'"),
active:n("select count(*) n from orders where status in('SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ON_THE_WAY','DRIVER_ARRIVED','TRIP_STARTED')"),completed:n("select count(*) n from orders where status='TRIP_COMPLETED'"),revenue:n("select coalesce(sum(final_price),0) n from orders where status='TRIP_COMPLETED'"),
daily:db.prepare("select date(created_at) day,count(*) orders,coalesce(sum(final_price),0) revenue from orders where created_at>=date('now','-6 day') group by day order by day").all()}));
r.get('/users',(q,s)=>s.json(db.prepare('select id,name,email,phone,role,created_at from users order by id desc').all()));
r.get('/drivers',(q,s)=>s.json(db.prepare('select d.id,u.name,u.phone,d.status,d.rating,d.is_active,v.vehicle_type,v.brand,v.plate_number from drivers d join users u on u.id=d.user_id left join vehicles v on v.id=d.vehicle_id').all()));
r.get('/orders',(q,s)=>s.json(db.prepare('select o.id,c.name customer,u.name driver,o.pickup_address,o.destination_address,o.distance_km,o.final_price,o.estimated_price,o.status,o.created_at from orders o join users c on c.id=o.customer_id left join drivers d on d.id=o.driver_id left join users u on u.id=d.user_id order by o.id desc limit 200').all()));
r.patch('/drivers/:id/active',(q,s)=>{const a=q.body?.active?1:0;const x=db.prepare("update drivers set is_active=?,status=case when ?=0 then 'OFFLINE' else status end where id=?").run(a,a,q.params.id);
if(!x.changes)throw bad('Driver tidak ditemukan',404);s.json({ok:true,active:a})});
module.exports=r;
