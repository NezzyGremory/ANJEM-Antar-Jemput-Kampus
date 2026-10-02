const db=require('../db'),maps=require('./maps'),{price}=require('../utils/geo');
exports.tariff=()=>db.prepare('select * from tariffs where active=1 order by id desc limit 1').get();
exports.estimate=async(a,b)=>{const t=exports.tariff(),r=await maps.route(a,b);
if(r.distance_km>t.radius_km)throw Object.assign(new Error(`Di luar radius layanan (maks ${t.radius_km} km)`),{status:422});
return{...r,price:price(r.distance_km,t)}};
