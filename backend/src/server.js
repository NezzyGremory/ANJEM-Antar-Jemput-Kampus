const express=require('express'),http=require('http'),os=require('os'),path=require('path'),rate=require('express-rate-limit'),c=require('./config');
require('../../database/seed')();

const app=express();app.disable('x-powered-by');app.use(express.json({limit:'50kb'}));
app.use('/api',rate({windowMs:60000,limit:500}));app.use('/api/auth',rate({windowMs:900000,limit:50}));
app.get('/api/config',(q,s)=>s.json({mapProvider:'openstreetmap'}));

app.use('/api/auth',require('./routes/auth'));
app.use('/api/maps',require('./routes/maps'));
app.use('/api/orders',require('./routes/orders'));
app.use('/api/drivers',require('./routes/drivers'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/chat',require('./routes/chat'));
app.use('/api',require('./routes/misc'));
app.use('/api',(q,s)=>s.status(404).json({error:'Endpoint tidak ditemukan'}));
app.use(express.static(path.join(__dirname,'../../frontend')));
app.use((e,q,s,n)=>{if(!e.status)console.error(e);s.status(e.status||500).json({error:e.status?e.message:'Kesalahan server'})});

const server=http.createServer(app);require('./services/realtime').attach(server);

function getLocalIPs(){
  const nets=os.networkInterfaces(),ips=[];
  for(const name of Object.keys(nets))
    for(const net of nets[name])
      if((net.family==='IPv4'||net.family===4)&&!net.internal)ips.push({name,ip:net.address});
  return ips;
}

server.listen(c.port,'0.0.0.0',()=>{
  const ips=getLocalIPs();
  console.log(`\n${'='.repeat(54)}`);
  console.log(`  🚀  ANJEM — Antar Jemput Kampus`);
  console.log(`${'─'.repeat(54)}`);
  console.log(`  Laptop ini  : http://localhost:${c.port}`);
  ips.forEach(x=>console.log(`  HP / Laptop 2: http://${x.ip}:${c.port}   [${x.name}]`));
  console.log(`\n  Demo login (NIM + password):`);
  console.log(`  Customer : NIM 60124001  / password123`);
  console.log(`  Driver   : NIM 60130001  / password123`);
  console.log(`  Admin    : admin@anjem.test / admin12345`);
  console.log(`${'='.repeat(54)}\n`);
});
