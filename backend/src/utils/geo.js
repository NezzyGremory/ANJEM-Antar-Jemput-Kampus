exports.km=(a,b,c,d)=>{const t=x=>x*Math.PI/180,h=Math.sin(t(c-a)/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(t(d-b)/2)**2;return 12742*Math.asin(Math.sqrt(h))};
// total = base_fare + km * price_per_km, minimal minimum_fare, dibulatkan ke atas per Rp500
exports.price=(km,t)=>Math.ceil(Math.max(t.minimum_fare,t.base_fare+km*t.price_per_km)/500)*500;
