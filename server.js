var http=require(“http”),https=require(“https”),ur=require(“url”);
var AK=process.env.ANTHROPIC_API_KEY||””,GK=process.env.GOOGLE_MAPS_API_KEY||””,NK=process.env.NOOKAL_API_KEY||””,PORT=process.env.PORT||8080;
function cors(r){r.setHeader(“Access-Control-Allow-Origin”,”*”);r.setHeader(“Access-Control-Allow-Methods”,“GET,POST,OPTIONS”);r.setHeader(“Access-Control-Allow-Headers”,“Content-Type”);}
function hreq(m,h,p,hd,b){return new Promise(function(res,rej){var d=b?JSON.stringify(b):””;var o={hostname:h,path:p,method:m,headers:hd||{}};if(d){o.headers[“Content-Type”]=“application/json”;o.headers[“Content-Length”]=Buffer.byteLength(d);}var r=https.request(o,function(s){var c=[];s.on(“data”,function(x){c.push(x);});s.on(“end”,function(){try{res({status:s.statusCode,body:JSON.parse(Buffer.concat(c).toString())});}catch(e){res({status:s.statusCode,body:{}});}});});r.on(“error”,rej);if(d)r.write(d);r.end();});}
function rbody(r){return new Promise(function(res,rej){var c=[];r.on(“data”,function(x){c.push(x);});r.on(“end”,function(){try{res(JSON.parse(Buffer.concat(c).toString()));}catch(e){res({});}});r.on(“error”,rej);});}
function drive(o,d){var p=”/maps/api/distancematrix/json?origins=”+encodeURIComponent(o+”, VIC, Australia”)+”&destinations=”+encodeURIComponent(d+”, VIC, Australia”)+”&mode=driving&key=”+GK;return hreq(“GET”,“maps.googleapis.com”,p,{},null).then(function(r){try{var e=r.body.rows[0].elements[0];if(e.status===“OK”)return{duration:e.duration.text,distance:e.distance.text};}catch(e){}return null;}).catch(function(){return null;});}
function nookal(){var t=new Date(),f=t.toISOString().split(“T”)[0],t2=new Date(t.getTime()+30*86400000),to=t2.toISOString().split(“T”)[0];return hreq(“GET”,“app.nookal.com”,”/api/v1/appointments?from=”+f+”&to=”+to,{“X-API-Key”:NK},null).then(function(r){return r.body;}).catch(function(e){return{error:e.message};});}
function ai(bk,di,dt){var pr=“You are a scheduling assistant for Specialised Driver Training SDT Melbourne. All clients in Victoria Australia. Recommend best instructor.\n\nINSTRUCTOR ROSTER:\n”+JSON.stringify(bk.instructors,null,2)+”\n\nNOOKAL DIARY:\n”+JSON.stringify(di,null,2)+”\n\nDRIVE TIMES:\n”+JSON.stringify(dt,null,2)+”\n\nBOOKING:\nClient: “+bk.clientName+”\nAddress: “+bk.clientAddress+”, VIC\nService: “+bk.serviceType+”\nFunding: “+bk.funding+”\nAvailability: “+bk.availability+”\nDuration: “+bk.duration+”\nMods: “+bk.modifications+”\nNotes: “+(bk.notes||“None”)+”\n\nRULES:\n1. MODS FIRST - disqualify if missing mod\n2. ZONE - match area to suburb\n3. ROUTING - no dead runs\n4. Sherri NO adaptive mods\n5. Jason ONLY LFA and spinner knob\n6. Christians Tuesdays often held for Community OT Brunswick\n\nRespond with:\n1. RECOMMENDED INSTRUCTOR\n2. GEOGRAPHIC ROUTING\n3. SUGGESTED TIME SLOT\n4. BACKUP OPTIONS\n5. FLAGS\n6. NOOKAL BOOKING NOTE”;return hreq(“POST”,“api.anthropic.com”,”/v1/messages”,{“x-api-key”:AK,“anthropic-version”:“2023-06-01”},{model:“claude-sonnet-4-20250514”,max_tokens:1500,messages:[{role:“user”,content:pr}]}).then(function(r){if(r.status!==200)throw new Error(“Anthropic “+r.status);var t=””;(r.body.content||[]).forEach(function(x){if(x.type===“text”)t+=x.text;});return t||“No response.”;});}
var server=http.createServer(function(rq,rs){
cors(rs);
if(rq.method===“OPTIONS”){rs.writeHead(204);rs.end();return;}
var p=ur.parse(rq.url,true);
if(p.pathname===”/health”){rs.writeHead(200,{“Content-Type”:“application/json”});rs.end(JSON.stringify({status:“ok”,message:“SDT running”}));return;}
if(p.pathname===”/analyse”&&rq.method===“POST”){
rbody(rq).then(function(bk){
var bases={Christian:“Montmorency VIC”,Gabriel:“Croydon North VIC”,Greg:“Kilsyth VIC”,Jason:“Wandin North VIC”,Marc:“Werribee VIC”,Sherri:“Wandin North VIC”,Yves:“Rye VIC”};
var dt={};
return Promise.all(Object.keys(bases).map(function(n){return drive(bk.clientAddress,bases[n]).then(function(d){if(d)dt[n]=d;});})).then(function(){return nookal();}).then(function(di){return ai(bk,di,dt);}).then(function(rec){rs.writeHead(200,{“Content-Type”:“application/json”});rs.end(JSON.stringify({success:true,recommendation:rec,driveTimes:dt}));});
}).catch(function(e){rs.writeHead(500,{“Content-Type”:“application/json”});rs.end(JSON.stringify({success:false,error:e.message}));});
return;}
rs.writeHead(404,{“Content-Type”:“application/json”});rs.end(JSON.stringify({error:“not found”}));
});
server.listen(PORT,function(){console.log(“SDT running on port “+PORT);});
