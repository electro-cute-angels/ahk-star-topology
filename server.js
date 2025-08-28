import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mime from 'mime';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me';

// Ensure uploads dir exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = mime.getExtension(file.mimetype) || 'bin';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

// In-memory state (resets on redeploy)
let currentRound = 1;
let backgroundUrl = null;
/** @type {Array<{id:string,url:string,round:number,at:number}>} */
let submissions = [];
/** Track one upload per user per round */
const uploadedBySocketRound = new Map(); // `${socket.id}:${round}` -> true
/** Track admin status on sockets */
const adminSockets = new Set();

// Static
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough: false, etag: true }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
  const sid = req.headers['x-socket-id'];
  if (!sid) {
    // No socket id passed; reject
    return res.status(400).json({ ok: false, error: 'Missing socket id' });
  }
  const key = `${sid}:${currentRound}`;
  if (uploadedBySocketRound.get(key)) {
    return res.status(429).json({ ok: false, error: 'Already uploaded this round' });
  }

  const relUrl = `/uploads/${req.file.filename}`;
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: relUrl,
    round: currentRound,
    at: Date.now()
  };
  submissions.push(record);
  uploadedBySocketRound.set(key, true);

  io.emit('submission', record); // broadcast new submission

  res.json({ ok: true, submission: record });
});

// Socket.IO
io.on('connection', (socket) => {
  // Send current state
  socket.emit('state', {
    currentRound,
    backgroundUrl,
    submissions: submissions.filter(s => s.round === currentRound)
  });

  socket.on('adminLogin', (pass) => {
    const ok = pass === ADMIN_PASS;
    if (ok) {
      adminSockets.add(socket.id);
      socket.emit('adminStatus', { ok: true });
    } else {
      socket.emit('adminStatus', { ok: false });
    }
  });

  socket.on('setBackground', (submissionId) => {
    if (!adminSockets.has(socket.id)) return;
    const sub = submissions.find(s => s.id === submissionId && s.round === currentRound);
    if (!sub) return;
    backgroundUrl = sub.url;
    io.emit('backgroundSet', { backgroundUrl, by: socket.id });
  });

  socket.on('newRound', () => {
    if (!adminSockets.has(socket.id)) return;
    currentRound += 1;
    backgroundUrl = null;
    // Note: keep old submissions for history if needed; we’re filtering by round anyway.
    io.emit('roundReset', { currentRound });
  });

  socket.on('disconnect', () => {
    adminSockets.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});