const socket = io();
let isAdmin = false;
let currentRound = null;

// For upload endpoint, we send our socket id as a header so server can enforce 1 per round.
function getSocketId() {
  return socket.id;
}

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

// Helpers
function setBackground(url) {
  const css = url ? `url("${url}")` : 'none';
  document.documentElement.style.setProperty('--bg-url', css);
}

function renderGallery(submissions) {
  $gallery.innerHTML = '';
  submissions
    .sort((a, b) => b.at - a.at)
    .forEach(s => {
      const card = document.createElement('div');
      card.className = 'card';

      const btn = document.createElement('button');
      btn.className = 'thumb';
      btn.title = isAdmin ? 'Set as background (host)' : 'Only host can set this as background';
      btn.addEventListener('click', () => {
        if (isAdmin) socket.emit('setBackground', s.id);
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

function setRound(n) {
  currentRound = n;
  $roundNum.textContent = String(n);
}

// Socket events
socket.on('connect', () => {
  // Nothing to do; server will send state event.
});

socket.on('state', (state) => {
  setRound(state.currentRound);
  setBackground(state.backgroundUrl);
  renderGallery(state.submissions);
});

socket.on('submission', (s) => {
  if (s.round !== currentRound) return;
  // Append new card
  const old = Array.from($gallery.querySelectorAll('img')).map(img => img.src);
  if (!old.includes(location.origin + s.url)) {
    renderGallery([{...s}, ...getCurrentCards()]);
  }
});

socket.on('backgroundSet', ({ backgroundUrl }) => {
  setBackground(backgroundUrl);
});

socket.on('roundReset', ({ currentRound }) => {
  setRound(currentRound);
  setBackground(null);
  renderGallery([]);
  $uploadMsg.textContent = '';
  $file.value = '';
});

socket.on('adminStatus', ({ ok }) => {
  if (ok) {
    isAdmin = true;
    $adminStatus.textContent = 'host logged in';
    $newRoundBtn.disabled = false;
  } else {
    isAdmin = false;
    $adminStatus.textContent = 'wrong key';
    $newRoundBtn.disabled = true;
  }
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

// Util to retrieve current card data from DOM (for quick prepend)
function getCurrentCards() {
  // reconstruct minimal data (we only need url and at for ordering display)
  const cards = [];
  $gallery.querySelectorAll('.card img').forEach(img => {
    cards.push({ id: 'dom', url: new URL(img.src).pathname, at: 0, round: currentRound });
  });
  return cards;
}