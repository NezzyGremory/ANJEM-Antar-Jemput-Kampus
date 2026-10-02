exports.w=f=>(q,s,n)=>Promise.resolve(f(q,s,n)).catch(n);
exports.bad=(m,s=400)=>Object.assign(new Error(m),{status:s});
exports.pt=p=>!!p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
