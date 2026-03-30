const http = require(‘http’);
const https = require(‘https’);
const url = require(‘url’);

// ── Config (set these as Railway environment variables) ──
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ‘’;
const GOOGLE_KEY    = process.env.GOOGLE_MAPS_API_KEY || ‘’;
const NOOKAL_KEY    = process.env.NOOKAL_API_KEY || ‘’;
const PORT          = process.env.PORT || 3000;

// ── CORS headers ──
function cors(res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
}

// ── Simple HTTPS request helper ──
function httpsPost(hostname, path, headers, body) {
return new Promise(function(resolve, reject) {
var data = JSON.stringify(body);
var opts = {
hostname: hostname,
path: path,
method: ‘POST’,
headers: Object.assign({ ‘Content-Type’: ‘application/json’, ‘Content-Length’: Buffer.byteLength(data) }, headers)
};
var req = https.request(opts, function(res) {
var chunks = [];
res.on(‘data’, function(c) { chunks.push(c); });
res.on(‘end’, function() {
try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
catch(e) { reject(new Error(‘JSON parse error’)); }
});
});
req.on(‘error’, reject);
req.write(data);
req.end();
});
}

function httpsGet(hostname, path, headers) {
return new Promise(function(resolve, reject) {
var opts = { hostname: hostname, path: path, method: ‘GET’, headers: headers || {} };
var req = https.request(opts, function(res) {
var chunks = [];
res.on(‘data’, function(c) { chunks.push(c); });
res.on(‘end’, function() {
try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
catch(e) { reject(new Error(‘JSON parse error’)); }
});
});
req.on(‘error’, reject);
req.end();
});
}

// ── Read request body ──
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

// ── Fetch Nookal diaries for all instructors ──
async function getNookalDiaries() {
var instructors = [‘Christian Lagos’, ‘Gabriel Lagos’, ‘Greg Ekkel’, ‘Jason Simmonds’, ‘Marc Seow’, ‘Sherri Simmonds’, ‘Yves Salzmann’];
var today = new Date();
var from = today.toISOString().split(‘T’)[0];
var to = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split(‘T’)[0];

var results = {};
for (var i = 0; i < instructors.length; i++) {
try {
var name = instructors[i];
var path = ‘/api/v1/appointments?from=’ + from + ‘&to=’ + to + ‘&provider=’ + encodeURIComponent(name);
var r = await httpsGet(‘app.nookal.com’, path, { ‘X-API-Key’: NOOKAL_KEY });
results[name] = r.body;
} catch(e) {
results[instructors[i]] = { error: e.message };
}
}
return results;
}

// ── Get drive time between two addresses ──
async function getDriveTime(origin, destination) {
try {
var path = ‘/maps/api/distancematrix/json?origins=’ +
encodeURIComponent(origin + ‘, VIC, Australia’) +
‘&destinations=’ + encodeURIComponent(destination + ‘, VIC, Australia’) +
‘&mode=driving&key=’ + GOOGLE_KEY;
var r = await httpsGet(‘maps.googleapis.com’, path, {});
if (r.body.rows && r.body.rows[0] && r.body.rows[0].elements && r.body.rows[0].elements[0].status === ‘OK’) {
return {
duration: r.body.rows[0].elements[0].duration.text,
durationSeconds: r.body.rows[0].elements[0].duration.value,
distance: r.body.rows[0].elements[0].distance.text
};
}
return null;
} catch(e) {
return null;
}
}

// ── Ask Claude for recommendation ──
async function getRecommendation(bookingData, diaryData, driveTimes) {
var prompt = [
‘You are a scheduling assistant for Specialised Driver Training (SDT), Melbourne. All clients are in Victoria, Australia.’,
‘’,
‘INSTRUCTOR ROSTER (with vehicle modifications):’,
JSON.stringify(bookingData.instructors, null, 2),
‘’,
‘LIVE DIARY DATA FROM NOOKAL (next 30 days):’,
JSON.stringify(diaryData, null, 2),
‘’,
‘DRIVE TIME DATA FROM GOOGLE MAPS:’,
JSON.stringify(driveTimes, null, 2),
‘’,
‘NEW BOOKING REQUEST:’,
’Client: ’ + bookingData.clientName,
’Address: ’ + bookingData.clientAddress + ‘, VIC Australia’,
’Service type: ’ + bookingData.serviceType,
’Funding: ’ + bookingData.funding,
’Referral: ’ + bookingData.referral,
’Availability: ’ + bookingData.availability,
’Duration: ’ + bookingData.duration,
’Modifications required: ’ + bookingData.modifications,
’Instructor preference: ’ + (bookingData.instructorPref || ‘None’),
’Gender preference: ’ + (bookingData.genderPref || ‘None’),
‘Pickup/lesson location: ’ + (bookingData.pickupLocation || ‘Client home’),
‘Notes: ’ + (bookingData.notes || ‘None’),
‘’,
‘RULES:’,
‘1. MODS FIRST - disqualify instructor if they lack a required modification’,
‘2. ZONE - match instructor working area to client suburb’,
‘3. ROUTING - use the Google Maps drive times to assess whether the new booking fits geographically into the instructor existing day without creating excessive dead runs’,
‘4. Check diary for conflicts on the requested availability days/times’,
‘5. Sherri has NO adaptive mods - standard lessons only’,
‘6. Jason has ONLY left foot accelerator and standard spinner knob’,
‘7. Christians Tuesdays often have Community OT Brunswick blocks’,
‘’,
‘Please respond with:’,
‘1. RECOMMENDED INSTRUCTOR - name and clear justification’,
‘2. GEOGRAPHIC ROUTING - how this fits their existing day with actual drive times’,
‘3. SUGGESTED TIME SLOT - specific day and time based on diary gaps’,
‘4. BACKUP OPTIONS - 1-2 alternatives’,
‘5. FLAGS - anything to resolve before confirming’,
‘6. NOOKAL BOOKING NOTE - ready-to-paste note in SDT style’
].join(’\n’);

var r = await httpsPost(‘api.anthropic.com’, ‘/v1/messages’,
{ ‘x-api-key’: ANTHROPIC_KEY, ‘anthropic-version’: ‘2023-06-01’ },
{ model: ‘claude-sonnet-4-20250514’, max_tokens: 1500, messages: [{ role: ‘user’, content: prompt }] }
);

if (r.status !== 200) throw new Error(’Anthropic error: ’ + JSON.stringify(r.body));
var text = ‘’;
if (r.body.content && r.body.content.length) {
for (var i = 0; i < r.body.content.length; i++) {
if (r.body.content[i].type === ‘text’) text += r.body.content[i].text;
}
}
return text;
}

// ── HTTP server ──
var server = http.createServer(async function(req, res) {
cors(res);

if (req.method === ‘OPTIONS’) { res.writeHead(204); res.end(); return; }

var parsed = url.parse(req.url, true);

// Health check
if (parsed.pathname === ‘/health’) {
res.writeHead(200, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ status: ‘ok’, message: ‘SDT Booking Assistant backend running’ }));
return;
}

// Main analyse endpoint
if (parsed.pathname === ‘/analyse’ && req.method === ‘POST’) {
try {
var bookingData = await readBody(req);

```
  // Fetch diary data from Nookal
  var diaryData;
  try { diaryData = await getNookalDiaries(); }
  catch(e) { diaryData = { error: 'Could not fetch Nookal data: ' + e.message }; }

  // Get drive times from client address to each instructor base
  var driveTimes = {};
  var bases = {
    'Christian': 'Montmorency',
    'Gabriel': 'Croydon North',
    'Greg': 'Kilsyth',
    'Jason': 'Wandin North',
    'Marc': 'Werribee',
    'Sherri': 'Wandin North',
    'Yves': 'Rye'
  };
  var names = Object.keys(bases);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var dt = await getDriveTime(bookingData.clientAddress, bases[name]);
    if (dt) driveTimes[name + ' (from client to instructor base)'] = dt;
  }

  // Get recommendation from Claude
  var recommendation = await getRecommendation(bookingData, diaryData, driveTimes);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, recommendation: recommendation, driveTimes: driveTimes }));

} catch(e) {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: e.message }));
}
return;
```

}

res.writeHead(404, { ‘Content-Type’: ‘application/json’ });
res.end(JSON.stringify({ error: ‘Not found’ }));
});

server.listen(PORT, function() {
console.log(’SDT Booking Assistant backend running on port ’ + PORT);
});
