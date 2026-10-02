const jwt=require('jsonwebtoken'),c=require('../config'),db=require('../db');
exports.sign=u=>jwt.sign({id:u.id,role:u.role},c.jwtSecret,{expiresIn:'7d'});
exports.verify=t=>jwt.verify(t,c.jwtSecret);
exports.auth=(...roles)=>(q,s,n)=>{try{const p=exports.verify((q.headers.authorization||'').replace('Bearer ',''));
const u=db.prepare('select id,name,email,phone,role from users where id=?').get(p.id);if(!u)throw 0;
if(roles.length&&!roles.includes(u.role))return s.status(403).json({error:'Akses ditolak'});q.user=u;n()}catch{s.status(401).json({error:'Belum login'})}};
