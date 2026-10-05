const r=require('express').Router(),db=require('../db'),{auth}=require('../services/auth'),rt=require('../services/realtime'),{bad}=require('../utils/http');

// GET /api/chat/:orderId — ambil pesan chat untuk order tertentu
r.get('/:orderId',auth('customer','driver'),(q,s)=>{
  const oid=+q.params.orderId;
  const o=db.prepare('select customer_id,driver_id from orders where id=?').get(oid);
  if(!o)throw bad('Order tidak ditemukan',404);
  // Verifikasi user punya akses ke order ini
  const uid=q.user.id;
  const driverId=q.user.role==='driver'?db.prepare('select id from drivers where user_id=?').get(uid)?.id:null;
  if(o.customer_id!==uid&&o.driver_id!==driverId)throw bad('Akses ditolak',403);
  const msgs=db.prepare('select c.id,c.sender_id,u.name sender_name,c.message,c.created_at from chats c join users u on u.id=c.sender_id where c.order_id=? order by c.id asc limit 100').all(oid);
  s.json(msgs);
});

// POST /api/chat/:orderId — kirim pesan
r.post('/:orderId',auth('customer','driver'),(q,s)=>{
  const oid=+q.params.orderId;
  const msg=String(q.body?.message||'').trim().slice(0,500);
  if(!msg)throw bad('Pesan tidak boleh kosong');
  const o=db.prepare('select customer_id,driver_id from orders where id=?').get(oid);
  if(!o)throw bad('Order tidak ditemukan',404);
  const uid=q.user.id;
  const driverId=q.user.role==='driver'?db.prepare('select id,user_id from drivers where user_id=?').get(uid)?.id:null;
  if(o.customer_id!==uid&&o.driver_id!==driverId)throw bad('Akses ditolak',403);
  const id=db.prepare('insert into chats(order_id,sender_id,message) values(?,?,?)').run(oid,uid,msg).lastInsertRowid;
  const chat=db.prepare('select c.id,c.sender_id,u.name sender_name,c.message,c.created_at from chats c join users u on u.id=c.sender_id where c.id=?').get(id);
  // Kirim ke customer dan driver via WebSocket
  rt.toUser(o.customer_id,'chat:message',{order_id:oid,...chat});
  const driverRow=o.driver_id?db.prepare('select user_id from drivers where id=?').get(o.driver_id):null;
  if(driverRow)rt.toUser(driverRow.user_id,'chat:message',{order_id:oid,...chat});
  s.status(201).json(chat);
});

module.exports=r;
