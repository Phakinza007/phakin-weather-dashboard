require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const OWM_KEY = process.env.OPENWEATHER_API_KEY || '';
const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

app.use(cors());
app.use(express.json());

// Cache + favorites DB
const db = new Database(path.join(__dirname, 'weather.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    city       TEXT NOT NULL,
    country    TEXT NOT NULL,
    lat        REAL,
    lon        REAL,
    added_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS search_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    query      TEXT NOT NULL,
    searched_at TEXT DEFAULT (datetime('now'))
  );
`);

const getCache = key => {
  const row = db.prepare("SELECT data FROM cache WHERE key = ? AND expires_at > datetime('now')").get(key);
  return row ? JSON.parse(row.data) : null;
};
const setCache = (key, data, ttlSeconds = 600) => {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare("INSERT OR REPLACE INTO cache (key, data, expires_at) VALUES (?, ?, ?)").run(key, JSON.stringify(data), expires);
};

// GET /api/weather/current?city=Bangkok or ?lat=13.75&lon=100.52
app.get('/api/weather/current', async (req, res) => {
  const { city, lat, lon, units = 'metric' } = req.query;
  if (!city && (!lat || !lon)) return res.status(400).json({ error: 'city or lat+lon required' });

  const cacheKey = city ? `current:${city}:${units}` : `current:${lat}:${lon}:${units}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _source: 'cache' });

  if (!OWM_KEY) return res.status(503).json({ error: 'OPENWEATHER_API_KEY not configured. Add it to .env' });

  try {
    const q = city ? `q=${encodeURIComponent(city)}` : `lat=${lat}&lon=${lon}`;
    const response = await fetch(`${OWM_BASE}/weather?${q}&units=${units}&appid=${OWM_KEY}`);
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    setCache(cacheKey, data);
    if (city) db.prepare("INSERT INTO search_history (query) VALUES (?)").run(city);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/weather/forecast?city=&days=5
app.get('/api/weather/forecast', async (req, res) => {
  const { city, lat, lon, units = 'metric', days = 5 } = req.query;
  if (!city && (!lat || !lon)) return res.status(400).json({ error: 'city or lat+lon required' });

  const cacheKey = city ? `forecast:${city}:${days}:${units}` : `forecast:${lat}:${lon}:${days}:${units}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _source: 'cache' });

  if (!OWM_KEY) return res.status(503).json({ error: 'OPENWEATHER_API_KEY not configured' });

  try {
    const q = city ? `q=${encodeURIComponent(city)}` : `lat=${lat}&lon=${lon}`;
    const response = await fetch(`${OWM_BASE}/forecast?${q}&units=${units}&cnt=${parseInt(days) * 8}&appid=${OWM_KEY}`);
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    const data = await response.json();
    setCache(cacheKey, data, 1800);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/weather/search?q=Bang — city autocomplete
app.get('/api/weather/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  if (!OWM_KEY) return res.json([]);
  try {
    const response = await fetch(`http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${OWM_KEY}`);
    const data = await response.json();
    res.json(data);
  } catch { res.json([]); }
});

// FAVORITES
app.get('/api/favorites', (req, res) => res.json(db.prepare('SELECT * FROM favorites ORDER BY added_at DESC').all()));
app.post('/api/favorites', (req, res) => {
  const { city, country, lat, lon } = req.body;
  if (!city || !country) return res.status(400).json({ error: 'city and country are required' });
  try {
    const r = db.prepare('INSERT INTO favorites (city, country, lat, lon) VALUES (?, ?, ?, ?)').run(city, country, lat || null, lon || null);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch { res.status(409).json({ error: 'Already in favorites' }); }
});
app.delete('/api/favorites/:id', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE id = ?').run(req.params.id);
  res.json({ message: 'Removed from favorites' });
});

// SEARCH HISTORY
app.get('/api/history', (req, res) => res.json(db.prepare('SELECT DISTINCT query, MAX(searched_at) as last_searched FROM search_history GROUP BY query ORDER BY last_searched DESC LIMIT 10').all()));

app.get('/api/health', (_, res) => res.json({ status: 'ok', project: 'Weather Dashboard', api_configured: !!OWM_KEY }));

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => console.log(`Weather Dashboard API on http://localhost:${PORT}`));
