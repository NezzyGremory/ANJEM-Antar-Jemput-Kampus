// Semua pemanggilan Google Maps Platform dilakukan di server (Routes API, Places API New, Geocoding API).
const c=require('../config');
const fail=(m,s)=>{throw Object.assign(new Error(m),{status:s})};
const post=async(url,mask,body)=>{if(!c.mapsKey)fail('GOOGLE_MAPS_API_KEY belum diisi di file .env',503);
const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':c.mapsKey,'X-Goog-FieldMask':mask},body:JSON.stringify(body)});
const j=await r.json();if(!r.ok)fail(j.error?.message||'Google API error',502);return j};
exports.route=async(a,b)=>{const ll=p=>({location:{latLng:{latitude:p.lat,longitude:p.lng}}});
const j=await post('https://routes.googleapis.com/directions/v2:computeRoutes','routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',{origin:ll(a),destination:ll(b),travelMode:'DRIVE',languageCode:'id'});
const x=j.routes?.[0];if(!x)fail('Rute tidak ditemukan',422);
return{distance_km:+(x.distanceMeters/1000).toFixed(2),duration_min:Math.max(1,Math.round(parseInt(x.duration)/60)),polyline:x.polyline.encodedPolyline}};
exports.search=async(q,p)=>{const j=await post('https://places.googleapis.com/v1/places:searchText','places.displayName,places.formattedAddress,places.location',{textQuery:q,languageCode:'id',locationBias:{circle:{center:{latitude:p.lat,longitude:p.lng},radius:5000}}});
return(j.places||[]).map(x=>({name:x.displayName?.text,address:x.formattedAddress,lat:x.location.latitude,lng:x.location.longitude}))};
exports.geocode=async(lat,lng)=>{if(!c.mapsKey)fail('GOOGLE_MAPS_API_KEY belum diisi di file .env',503);
const j=await(await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=id&key=${c.mapsKey}`)).json();
return j.results?.[0]?.formatted_address||`${lat.toFixed(5)}, ${lng.toFixed(5)}`};
