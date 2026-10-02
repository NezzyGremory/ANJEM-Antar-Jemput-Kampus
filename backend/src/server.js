const express=require('express'),http=require('http'),os=require('os'),path=require('path'),rate=require('express-rate-limit'),c=require('./config');
require('../../database/seed')();

const app=express();app.disable('x-powered-by');app.use(express.json({limit:'50kb'}));
app.use('/api',rate({windowMs:60000,limit:300}));app.use('/api/auth',rate({windowMs:900000,limit:30}));
app.get('/api/config',(q,s)=>s.json({mapProvider:'openstreetmap'}));// Leaflet + OSM — tanpa Google API key

app.use('/api/auth',require('./routes/auth'));app.use('/api/maps',require('./routes/maps'));app.use('/api/orders',require('./routes/orders'));
app.use('/api/drivers',require('./routes/drivers'));app.use('/api/admin',require('./routes/admin'));app.use('/api',require('./routes/misc'));
app.use('/api',(q,s)=>s.status(404).json({error:'Endpoint tidak ditemukan'}));
app.use(express.static(path.join(__dirname,'../../frontend')));
app.use((e,q,s,n)=>{if(!e.status)console.error(e);s.status(e.status||500).json({error:e.status?e.message:'Kesalahan server'})});

const server=http.createServer(app);require('./services/realtime').attach(server);

function getLocalIPs(){
  const nets=os.networkInterfaces(),ips=[];
  for(const name of Object.keys(nets)){
    for(const net of nets[name]){
      if((net.family==='IPv4'||net.family===4)&&!net.internal)ips.push({name,ip:net.address});
    }
  }
  return ips;
}

server.listen(c.port,'0.0.0.0',()=>{
  const ips=getLocalIPs();
  console.log(`\n==================================================`);
  console.log(`🚀 ANJEM (Antar Jemput Kampus) SIAP DIGUNAKAN!`);
  console.log(`  Local      : http://localhost:${c.port}`);
  ips.forEach(x=>console.log(`  Laptop 2/HP: http://${x.ip}:${c.port}  (Wi-Fi: ${x.name})`));
  console.log(`  (Buka link di Laptop 2 atau HP yang terhubung ke Wi-Fi yang sama)`);
  console.log(`==================================================\n`);
});
