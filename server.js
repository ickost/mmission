const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- JSON file store ---
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
  }
  // Test write permission
  const testFile = path.join(DATA_DIR, '.write-test');
  fs.writeFileSync(testFile, 'ok');
  fs.unlinkSync(testFile);
  console.log('Data storage OK:', DB_FILE);
} catch(e) {
  console.error('WARNING: Cannot write to DATA_DIR:', DATA_DIR, e.message);
  console.error('Falling back to __dirname');
}

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch(e) { console.error('DB load error:', e.message); }
  return { rooms: {}, missions: {} };
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch(e) {
    console.error('DB save error:', e.message);
  }
}

// --- OG preview cache (in-memory) ---
const ogCache = new Map();

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MissionBoard/1.0)' }, timeout: 5000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => { data += chunk; if (data.length > 50000) res.destroy(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractOG(html) {
  const get = (prop) => {
    const re = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    return m ? m[1] : '';
  };
  const titleFallback = () => {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : '';
  };
  return {
    title: get('title') || titleFallback(),
    description: get('description'),
    image: get('image'),
    site_name: get('site_name'),
  };
}

// --- API Routes ---

app.post('/api/rooms/enter', (req, res) => {
  const { code, nickname } = req.body;
  if (!code || !nickname) return res.status(400).json({ error: '방 코드와 닉네임을 입력해주세요.' });
  if (code.length > 20) return res.status(400).json({ error: '방 코드는 20자 이하로 입력해주세요.' });
  if (nickname.length > 10) return res.status(400).json({ error: '닉네임은 10자 이하로 입력해주세요.' });

  const db = loadDB();
  const c = code.trim();
  if (!db.rooms[c]) db.rooms[c] = { created_at: new Date().toISOString() };
  saveDB(db);
  res.json({ ok: true, room: c, nickname: nickname.trim() });
});

// Monthly missions
app.get('/api/rooms/:code/missions', (req, res) => {
  const { code } = req.params;
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year, month 파라미터가 필요합니다.' });

  const db = loadDB();
  const all = Object.values(db.missions).filter(m => {
    if (m.room_code !== code) return false;
    const d = new Date(m.event_date + 'T00:00:00');
    return d.getFullYear() === Number(year) && (d.getMonth() + 1) === Number(month);
  });
  all.sort((a, b) => a.event_date.localeCompare(b.event_date));
  res.json({ missions: all });
});

// All upcoming missions (for dashboard)
app.get('/api/rooms/:code/upcoming', (req, res) => {
  const { code } = req.params;
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = Object.values(db.missions)
    .filter(m => m.room_code === code && m.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const past = Object.values(db.missions)
    .filter(m => m.room_code === code && m.event_date < today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date))
    .slice(0, 5);

  res.json({ upcoming, past });
});

app.post('/api/rooms/:code/missions', (req, res) => {
  const { code } = req.params;
  const { title, description, event_date, owner } = req.body;
  if (!title || !event_date || !owner) return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
  if (title.length > 30) return res.status(400).json({ error: '제목은 30자 이하로 입력해주세요.' });

  const db = loadDB();
  const id = nanoid(10);
  const mission = {
    id, room_code: code, title: title.trim(),
    description: (description || '').trim(), event_date,
    owner: owner.trim(), participants: [owner.trim()],
    created_at: new Date().toISOString(),
  };
  db.missions[id] = mission;
  saveDB(db);
  res.json({ ok: true, mission });
});

app.put('/api/rooms/:code/missions/:id', (req, res) => {
  const { code, id } = req.params;
  const { title, description, event_date, owner } = req.body;
  if (!title || !event_date || !owner) return res.status(400).json({ error: '필수 항목을 입력해주세요.' });

  const db = loadDB();
  const m = db.missions[id];
  if (!m || m.room_code !== code) return res.status(404).json({ error: '미션을 찾을 수 없습니다.' });
  if (m.owner !== owner.trim()) return res.status(403).json({ error: '미션오너만 수정할 수 있습니다.' });

  m.title = title.trim();
  m.description = (description || '').trim();
  m.event_date = event_date;
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/rooms/:code/missions/:id', (req, res) => {
  const { code, id } = req.params;
  const { owner } = req.body;
  if (!owner) return res.status(400).json({ error: '닉네임이 필요합니다.' });

  const db = loadDB();
  const m = db.missions[id];
  if (!m || m.room_code !== code) return res.status(404).json({ error: '미션을 찾을 수 없습니다.' });
  if (m.owner !== owner.trim()) return res.status(403).json({ error: '미션오너만 삭제할 수 있습니다.' });

  delete db.missions[id];
  saveDB(db);
  res.json({ ok: true });
});

app.post('/api/rooms/:code/missions/:id/join', (req, res) => {
  const { code, id } = req.params;
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: '닉네임이 필요합니다.' });

  const db = loadDB();
  const m = db.missions[id];
  if (!m || m.room_code !== code) return res.status(404).json({ error: '미션을 찾을 수 없습니다.' });

  const nick = nickname.trim();
  if (!m.participants.includes(nick)) m.participants.push(nick);
  saveDB(db);
  res.json({ ok: true, participants: m.participants });
});

app.post('/api/rooms/:code/missions/:id/leave', (req, res) => {
  const { code, id } = req.params;
  const { nickname } = req.body;
  if (!nickname) return res.status(400).json({ error: '닉네임이 필요합니다.' });

  const db = loadDB();
  const m = db.missions[id];
  if (!m || m.room_code !== code) return res.status(404).json({ error: '미션을 찾을 수 없습니다.' });

  const nick = nickname.trim();
  if (m.owner === nick) return res.status(400).json({ error: '미션오너는 빠질 수 없습니다. 미션을 삭제해주세요.' });

  m.participants = m.participants.filter(p => p !== nick);
  saveDB(db);
  res.json({ ok: true, participants: m.participants });
});

// OG link preview
app.get('/api/og', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url 파라미터가 필요합니다.' });

  try {
    const u = decodeURIComponent(url);
    if (ogCache.has(u)) return res.json(ogCache.get(u));

    const html = await fetchURL(u);
    const og = extractOG(html);
    og.url = u;
    ogCache.set(u, og);
    if (ogCache.size > 200) {
      const first = ogCache.keys().next().value;
      ogCache.delete(first);
    }
    res.json(og);
  } catch(e) {
    res.json({ title: '', description: '', image: '', url: url });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Mission Board running on port ' + PORT);
  console.log('DATA_DIR=' + DATA_DIR);
  console.log('DB_FILE=' + DB_FILE);
});

process.on('uncaughtException', (e) => { console.error('Uncaught:', e.message); });
process.on('unhandledRejection', (e) => { console.error('Unhandled:', e); });
