const r=require('express').Router(),maps=require('../services/maps'),trip=require('../services/trip'),{auth}=require('../services/auth'),{w,bad,pt}=require('../utils/http');
r.use(auth());
r.get('/search',w(async(q,s)=>{const t=String(q.query.q||'').trim();if(t.length<2)throw bad('Kata kunci terlalu pendek');
s.json(await maps.search(t,{lat:+q.query.lat||-7.0513,lng:+q.query.lng||110.438}))}));
r.get('/geocode',w(async(q,s)=>{const lat=+q.query.lat,lng=+q.query.lng;if(!pt({lat,lng}))throw bad('Koordinat tidak valid');s.json({address:await maps.geocode(lat,lng)})}));
r.post('/estimate',w(async(q,s)=>{const{pickup,destination}=q.body||{};if(!pt(pickup)||!pt(destination))throw bad('Koordinat tidak valid');s.json(await trip.estimate(pickup,destination))}));
module.exports=r;
