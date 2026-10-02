const Database=require('better-sqlite3'),fs=require('fs'),path=require('path'),c=require('./config');
const db=new Database(c.dbFile);db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(fs.readFileSync(path.join(__dirname,'../../database/schema.sql'),'utf8'));
module.exports=db;
