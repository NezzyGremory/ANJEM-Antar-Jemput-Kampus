const {WebSocketServer}=require('ws'),{verify}=require('./auth');const m=new Map();
exports.attach=server=>new WebSocketServer({server,path:'/ws'}).on('connection',(s,q)=>{try{const p=verify(new URL(q.url,'http://x').searchParams.get('token'));
if(!m.has(p.id))m.set(p.id,new Set());m.get(p.id).add(s);s.on('close',()=>m.get(p.id).delete(s))}catch{s.close()}});
exports.toUser=(id,ev,data)=>(m.get(id)||[]).forEach(s=>s.readyState===1&&s.send(JSON.stringify({ev,data})));
