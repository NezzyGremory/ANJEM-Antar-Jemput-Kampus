const path=require('path');require('dotenv').config({path:path.join(__dirname,'../../.env')});
module.exports={port:+process.env.PORT||3000,jwtSecret:process.env.JWT_SECRET||'dev-secret-ganti-di-production',dbFile:process.env.DB_FILE||path.join(__dirname,'../../database/anjem.db')};
