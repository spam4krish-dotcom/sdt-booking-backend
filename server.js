var http = require(‘http’);
var https = require(‘https’);
var url = require(‘url’);

var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ‘’;
var GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || ‘’;
var NOOKAL_KEY = process.env.NOOKAL_API_KEY || ‘’;
var PORT = process.env.PORT || 3000;

function setCors(res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
}

function httpsRequest(method, hostname, path, headers, body) {
return new Promise(function(resolve, reject) {
var data = body ? JSON.stringify(body) : ‘’;
var opts = { hostname: hostname, path: path, method: method, headers: headers };
if (data) {
opts.headers[‘Content-Type’] = ‘application/json’;
opts.headers[‘Content-Length’] = Buffer.byteLength(data);
}
var req = https.request(opts, function(res) {
var chunks = [];
res.on(‘data’, function(c) { chunks.push(c); });
res.on(‘end’, function() {
try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
catch(e) { resolve({ status: res.statusCode, body: {} }); }
});
});
req.on(‘error’, reject);
if (data) req.write(data);
req.end();
});
}

function readBody(req) {
return new Promise(function(resolve, reject) {
var chunks = [];
req.on(‘data’, function(c) { chunks.push(c); });
req.on(‘end’, function() {
try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
catch(e) { resolve({}); }
});
req.on(‘error’, reject);
});
}

function getDriveTime(origin, destination) {
var path = ‘/maps/api/distancematrix/json?origins=’ +
encodeURIComponent(origin + ‘, VIC, Australia’) +
‘&destinations=’ + encodeURIComponent(destination + ‘, VIC, Australia’) +
‘&mode=driving&key=’ + GOOGLE_KEY;
return httpsRequest(‘GET’, ‘maps.googleapis.com’, path, {}, null).then(function(r) {
try {
var el = r.body.rows[0].elements[0];
if (el.status === ‘OK’) return { duration: el.duration.text, distance: el.distance.text };
} catch(e) {}
return null;
}).catch(function() { return null; });
}

function getNookalDiary() {
var today = new Date();
var from = today.toISOString().split(‘T’)[0];
var future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
var to = future.toISOString().split(‘T’)[0];
var path = ‘/api/v1/appointments?from=’ + from + ‘&to=’ + to;
return httpsRequest(‘GET’, ‘app.nookal.com’, path, { ‘X-API-Key’: NOOKAL_KEY }, null)
.then(function(r) { return r.body; })
.catch(function(e) { return { error: e.message }; });
}

function getRecommendation(booking, diary, driveTimes) {
var prompt = ‘You are a scheduling assistant for Specialised Driver Training (SDT) in Melbourne, Victoria, Australia. Recommend the best instructor for this new booking.\n\n’
+ ‘INSTRUCTOR ROSTER:\n’ + JSON.stringify(booking.instructors, null, 2) + ‘\n\n’
+ ‘LIVE NOOKAL DIARY (next 30 days):\n’ + JSON.stringify(diary, null, 2) + ‘\n\n’
+ ‘GOOGLE MAPS DRIVE TIMES FROM CLIENT TO INSTRUCTOR BASES:\n’ + JSON.stringify(driveTimes, null, 2) + ‘\n\n’
+ ‘NEW BOOKING:\n’
+ ’Client: ’ + booking.clientName + ‘\n’
+ ’Address: ’ + booking.clientAddress + ‘, VIC Australia\n’
+ ’DOB: ’ + (booking.clientDOB || ‘Not provided’) + ‘\n’
+ ’Phone: ’ + (booking.clientPhone || ‘Not provided’) + ‘\n’
+ ’Email: ’ + (booking.clientEmail || ‘Not provided’) + ‘\n’
+ ’Service: ’ + booking.serviceType + ‘\n’
+ ’Funding: ’ + booking.funding + ‘\n’
+ ’Referral: ’ + booking.referral + ‘\n’
+ ’Availability: ’ + booking.availability + ‘\n’
+ ’Duration: ’ + booking.duration + ‘\n’
+ ’Pickup location: ’ + (booking.pickupLocation || ‘Client home’) + ‘\n’
+ ’Modifications: ’ + booking.modifications + ‘\n’
+ ’Instructor preference: ’ + (booking.instructorPref || ‘None’) + ‘\n’
+ ’Gender preference: ’ + (booking.genderPref || ‘None’) + ‘\n’
+ ’Notes: ’ + (booking.notes || ‘None’) + ‘\n\n’
+ ‘RULES:\n’
+ ‘1. MODS FIRST - disqualify if instructor lacks required mod\n’
+ ‘2. ZONE - match instructor area to client suburb\n’
+ ‘3. ROUTING - use drive times to check geographic fit, avoid dead runs\n’
+ ‘4. Check diary for conflicts\n’
+ ‘5. Sherri has NO adaptive mods - standard lessons only\n’
+ ‘6. Jason has ONLY left foot accelerator and standard spinner knob\n’
+ ‘7. Christians Tuesdays often have Community OT Brunswick blocks\n\n’
+ ‘Respond with:\n’
+ ‘1. RECOMMENDED INSTRUCTOR - name and justification\n’
+ ‘2. GEOGRAPHIC ROUTING - how this fits their day with drive times\n’
+ ‘3. SUGGESTED TIME SLOT - specific day and time based on diary\n’
+ ‘4. BACKUP OPTIONS - 1-2 alternatives\n’
+ ‘5. FLAGS - anything to resolve before confirming\n’
+ ‘6. NOOKAL BOOKING NOTE - ready-to-paste in SDT style’;

return httpsRequest(‘POST’, ‘api.anthropic.com’, ‘/v1/messages’, {
‘x-api-key’: ANTHROPIC_KEY,
‘anthropic-version’: ‘2023-06-01’
}, { model: ‘claude-sonnet-4-20250514’, max_tokens: 1500, messages: [{ role: ‘user’, content: prompt }] })
.then(function(r) {
if (r.status !== 200) throw new Error(’Anthropic error ’ + r.status + ’: ’ + JSON.stringify(r.body));
var text = ‘’;
var content = r.body.content || [];
for (var i = 0; i < content.length; i++) {
if (content[i].type === ‘text’) text += content[i].text;
}
return text || ‘No response received.’;
});
}

var server = http.createServer(function(req, res) {
setCors(res);
if (req.method === ‘OPTIONS’) { res.writeHead(204); res.end(); return; }

var parsed = url.parse(req.url, true);

if (parsed.pathname === ‘/health’) {
res.writeHead(200, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ status: ‘ok’, message: ‘SDT Booking Assistant running’ }));
return;
}

if (parsed.pathname === ‘/analyse’ && req.method === ‘POST’) {
readBody(req).then(function(booking) {
var bases = {
‘Christian’: ‘Montmorency VIC’,
‘Gabriel’: ‘Croydon North VIC’,
‘Greg’: ‘Kilsyth VIC’,
‘Jason’: ‘Wandin North VIC’,
‘Marc’: ‘Werribee VIC’,
‘Sherri’: ‘Wandin North VIC’,
‘Yves’: ‘Rye VIC’
};
var driveTimes = {};
var names = Object.keys(bases);
var drivePromises = names.map(function(name) {
return getDriveTime(booking.clientAddress, bases[name]).then(function(dt) {
if (dt) driveTimes[name] = dt;
});
});
return Promise.all(drivePromises)
.then(function() { return getNookalDiary(); })
.then(function(diary) { return getRecommendation(booking, diary, driveTimes); })
.then(function(recommendation) {
res.writeHead(200, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ success: true, recommendation: recommendation, driveTimes: driveTimes }));
});
}).catch(function(e) {
res.writeHead(500, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ success: false, error: e.message }));
});
return;
}

res.writeHead(404, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ error: ‘Not found’ }));
});

server.listen(PORT, function() {
console.log(’SDT Booking Assistant backend running on port ’ + PORT);
});
