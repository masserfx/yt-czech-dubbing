const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3847;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Database ---
const db = new Database(path.join(__dirname, 'b2b-hub.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 2,
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent TEXT NOT NULL,
    to_agent TEXT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'message',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    section TEXT NOT NULL,
    content TEXT NOT NULL,
    agent TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Tasks API ---
app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY priority ASC, created_at DESC').all();
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { agent, title, description, priority, status } = req.body;
  const stmt = db.prepare('INSERT INTO tasks (agent, title, description, priority, status) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(agent, title, description || '', priority || 2, status || 'pending');
  res.json({ id: info.lastInsertRowid });
});

app.patch('/api/tasks/:id', (req, res) => {
  const { status, result } = req.body;
  if (status) db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  if (result) db.prepare('UPDATE tasks SET result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(result, req.params.id);
  res.json({ ok: true });
});

// --- Messages API ---
app.get('/api/messages', (req, res) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 100').all();
  res.json(messages);
});

app.post('/api/messages', (req, res) => {
  const { from_agent, to_agent, content, type } = req.body;
  const stmt = db.prepare('INSERT INTO messages (from_agent, to_agent, content, type) VALUES (?, ?, ?, ?)');
  const info = stmt.run(from_agent, to_agent || null, content, type || 'message');
  res.json({ id: info.lastInsertRowid });
});

// --- Reports API ---
app.get('/api/reports', (req, res) => {
  const reports = db.prepare('SELECT * FROM reports ORDER BY section, created_at DESC').all();
  res.json(reports);
});

app.post('/api/reports', (req, res) => {
  const { title, section, content, agent } = req.body;
  const existing = db.prepare('SELECT id, version FROM reports WHERE section = ? AND title = ?').get(section, title);
  if (existing) {
    db.prepare('UPDATE reports SET content = ?, agent = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(content, agent, existing.id);
    res.json({ id: existing.id, version: existing.version + 1 });
  } else {
    const info = db.prepare('INSERT INTO reports (title, section, content, agent) VALUES (?, ?, ?, ?)').run(title, section, content, agent);
    res.json({ id: info.lastInsertRowid, version: 1 });
  }
});

// --- Dashboard summary ---
app.get('/api/summary', (req, res) => {
  const taskStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `).all();
  const recentMessages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 10').all();
  const reportCount = db.prepare('SELECT COUNT(*) as count FROM reports').get();
  res.json({ taskStats, recentMessages, reportCount: reportCount.count });
});

app.listen(PORT, () => {
  console.log(`B2B Hub running at http://localhost:${PORT}`);
});
