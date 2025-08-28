const socket = io();

let isAdmin = false;
let currentRound = null;
let subs = []; // authoritative client-side list for the current round

// Elements
const $roundNum = document.getElementById('roundNum');
const $gallery = document.getElementById('gallery');
const $uploadForm = document.getElementById('uploadForm');
const $file = document.getElementById('file');
const $uploadMsg = document.getElementById('uploadMsg');
const $adminKey = document.getElementById('adminKey');
const $loginBtn = document.getElementById('loginBtn');
const $adminStatus = document.getElementById('adminStatus');
const $newRoundBtn = document.getElementById('newRoundBtn');

function getSocketId() { return socket.id; }

function setBackground(url) {
  const css = url ? `url("${url}")` : 'none';
  document.documentElement.style.setProperty('--bg-url', css);
}

function setRound(n) {
  currentRound = n;
  $roundNum.textContent = String(n);
}

function renderGallery(list) {
  $gallery.innerHTML = '';
  list
    .slice()
    .sort((a, b) => b.at - a.at)
    .forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';

      const btn = document.createElement('button');
      btn.className = 'thumb';
      btn.title = isAdmin ? 'Set as background (host)' : 'Only host can set this as background';
      btn.addEventListener('click', () => {
        if (isAdmin) socket.emit('setBackground', s.id); // uses REAL id
      });

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = s.url;
      btn.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const ts = new Date(s.at).toLocaleTimeString();
      meta.textContent = `Uploaded @ ${ts}`;

      card.appendChild(btn);
      card.appendChild(meta);
      $gallery.appendChild(card);
    });
}

// Socket events
socket.on('state', (state) => {
  setRound(state.currentRound);
  setBackground(state.backgroundUrl);

  // authoritative reset from server
  subs = state.submissions || [];
  renderGallery(subs);
});

socket.on('submission', (s) => {
  if (s.round !== currentRound) return;
  // append only if this id is not present yet
  if (!subs.find(x => x.id === s.id)) {
    subs.push(s);
    renderGallery(subs);
  }
});

socket.on('backgroundSet', ({ backgroundUrl }) => {
  setBackground(backgroundUrl);
});

socket.on('roundReset', ({ currentRound }) => {
  setRound(currentRound);
  setBackground(null);
  subs = []; // new round = empty list
  renderGallery(subs);
  $uploadMsg.textContent = '';
  $file.value = '';
});

socket.on('adminStatus', ({ ok }) => {
  isAdmin = !!ok;
  $adminStatus.textContent = ok ? 'host logged in' : 'wrong key';
  $newRoundBtn.disabled = !ok;
});

// Upload form
$uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $file.files[0];
  if (!f) return;

  const fd = new FormData();
  fd.append('image', f);

  try {
    $uploadMsg.textContent = 'Uploading...';
    const res = await fetch('/upload', {
      method: 'POST',
      headers: { 'x-socket-id': getSocketId() },
      body: fd
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Upload failed');
    $uploadMsg.textContent = 'Uploaded!';
  } catch (err) {
    $uploadMsg.textContent = err.message;
  }
});

// Admin login
$loginBtn.addEventListener('click', () => {
  const pass = $adminKey.value.trim();
  if (!pass) return;
  socket.emit('adminLogin', pass);
});

// New round
$newRoundBtn.addEventListener('click', () => {
  if (isAdmin) socket.emit('newRound');
});
