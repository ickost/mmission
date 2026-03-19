const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- JSON file store ---
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'data.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch(e) { console.error('DB load error:', e); }
  return { rooms: {}, missions: {} };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mission Board running on port ${PORT}`));
