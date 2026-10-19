(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const defaults = { focus: 25, short: 5, long: 15, cycle: 4 };
  let settings = { ...defaults, ...(read('deepFocusSettings') || {}) };
  for (const [key, min, max] of [['focus', 1, 180], ['short', 1, 60], ['long', 1, 90], ['cycle', 2, 8]]) {
    const value = Number(settings[key]); settings[key] = Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : defaults[key];
  }
  let mode = 'focus';
  let remaining = settings.focus * 60;
  let total = remaining;
  let running = false;
  let deadline = 0;
  let interval = null;
  let completed = Number(read('deepFocusCompleted') || 0);
  let cycleProgress = Number(read('deepFocusCycleProgress') || 0);
  let audioContext = null;
  let masterOn = false;
  const audioNodes = {};
  const volumes = { rain: 35, wind: 20, fire: 15, birds: 12, ...(read('deepFocusVolumes') || {}) };
  Object.keys(volumes).forEach(name => { const value = Number(volumes[name]); volumes[name] = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0; });
  const scenes = {
    mountains: { title: 'REFÚGIO NAS MONTANHAS', quote: 'A tranquilidade também é uma forma de progresso.', image: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2200&q=90', video: '' },
    rain: { title: 'CHUVA NA JANELA', quote: 'Diminua o ritmo. Você não precisa correr o tempo todo.', image: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=2200&q=90', video: '' },
    campfire: { title: 'ACAMPAMENTO NOTURNO', quote: 'Descanse a mente para voltar com intenção.', image: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=2200&q=90', video: '' },
    forest: { title: 'FLORESTA SILENCIOSA', quote: 'Presença é voltar, com calma, ao que está diante de você.', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2200&q=90', video: '' }
  };
  let activeScene = 'mountains';
  let backgroundObjectUrl = null;
  let previewObjectUrl = null;
  let previewAsset = null;
  let backgroundDbPromise = null;
  function read(key) { try { const raw = localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); } catch { return null; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function openBackgroundDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('Armazenamento local de arquivos indisponível.'));
    if (!backgroundDbPromise) backgroundDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('deepFocusMedia', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('backgrounds');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento local.'));
    });
    return backgroundDbPromise;
  }
  async function storeLocalBackground(file) {
    const db = await openBackgroundDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('backgrounds', 'readwrite');
      transaction.objectStore('backgrounds').put(file, 'active');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao guardar o arquivo.'));
      transaction.onabort = () => reject(transaction.error || new Error('O armazenamento local foi cancelado.'));
    });
  }
  async function readLocalBackground() {
    const db = await openBackgroundDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction('backgrounds').objectStore('backgrounds').get('active');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Falha ao carregar o arquivo local.'));
    });
  }
  async function deleteLocalBackground() {
    try {
      const db = await openBackgroundDb();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('backgrounds', 'readwrite');
        transaction.objectStore('backgrounds').delete('active');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Falha ao remover o arquivo.'));
      });
    } catch {}
  }
  function setBackgroundStatus(message, isError = false) {
    const status = $('#backgroundStatus');
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }
  function clearPreview() {
    const image = $('#backgroundPreviewImage'); const video = $('#backgroundPreviewVideo'); const frame = $('#backgroundPreviewFrame');
    image.hidden = true; image.removeAttribute('src'); video.pause(); video.hidden = true; video.removeAttribute('src'); video.load(); frame.hidden = true; frame.removeAttribute('src');
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null; previewAsset = null;
    $('#applyBackgroundBtn').disabled = true;
    $('#backgroundPreviewMessage').textContent = 'Nenhuma nova mídia selecionada.';
  }
  function showPreview(asset) {
    clearPreview(); previewAsset = asset;
    const message = $('#backgroundPreviewMessage');
    if (asset.kind === 'youtube') {
      const frame = $('#backgroundPreviewFrame'); frame.src = youtubeEmbedUrl(asset.id); frame.hidden = false;
      message.textContent = location.protocol === 'file:' ? 'Abra pelo Live Server para visualizar YouTube; a origem file:// não é aceita pelo player.' : 'Prévia do YouTube. A reprodução depende das permissões de incorporação do vídeo.';
      asset.validated = true; $('#applyBackgroundBtn').disabled = false; return;
    }
    const source = asset.file ? (previewObjectUrl = URL.createObjectURL(asset.file)) : asset.url;
    if (asset.kind === 'image') {
      const image = $('#backgroundPreviewImage'); image.onload = () => { message.textContent = 'Prévia carregada.'; asset.validated = true; $('#applyBackgroundBtn').disabled = false; }; image.onerror = () => { clearPreview(); setBackgroundStatus('A imagem não pôde ser carregada.', true); }; image.src = source; image.hidden = false;
    } else {
      const video = $('#backgroundPreviewVideo'); video.onloadedmetadata = () => { asset.validated = true; $('#applyBackgroundBtn').disabled = false; }; video.onerror = () => { clearPreview(); setBackgroundStatus('O vídeo não pôde ser reproduzido neste navegador ou origem.', true); }; video.src = source; video.hidden = false; video.load(); video.play().catch(() => { message.textContent = 'Prévia pronta. A reprodução automática foi bloqueada; use o controle de reprodução do navegador se necessário.'; });
      message.textContent = 'Carregando prévia do vídeo…';
    }
    setBackgroundStatus(asset.file ? 'Arquivo local pronto para aplicação.' : 'Mídia pronta para aplicação.');
  }
  function youtubeVideoId(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
    }
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  function youtubeEmbedUrl(id, loop = false) {
    const params = new URLSearchParams({ autoplay: '1', mute: '1', controls: '0', playsinline: '1', rel: '0' });
    if (loop) { params.set('loop', '1'); params.set('playlist', id); }
    if (location.protocol === 'http:' || location.protocol === 'https:') { params.set('origin', location.origin); params.set('enablejsapi', '1'); }
    return `https://www.youtube.com/embed/${id}?${params}`;
  }
  function validHttpUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; }
  }
  function probeImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image(); const timer = setTimeout(() => { image.src = ''; reject(new Error('Tempo esgotado ao carregar a imagem.')); }, 12000);
      image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('A origem não forneceu uma imagem válida.')); }; image.src = url;
    });
  }
  function probeVideo(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video'); const timer = setTimeout(() => { video.src = ''; reject(new Error('Tempo esgotado ao carregar o vídeo.')); }, 12000);
      video.muted = true; video.preload = 'metadata';
      video.onloadedmetadata = () => { clearTimeout(timer); video.removeAttribute('src'); video.load(); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('O vídeo não pôde ser carregado ou o codec não é compatível.')); }; video.src = url;
    });
  }
  async function previewUrl() {
    clearPreview();
    const url = validHttpUrl($('#videoUrlInput').value.trim());
    if (!url) { setBackgroundStatus('Informe uma URL HTTP ou HTTPS válida.', true); return; }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
      const id = youtubeVideoId(url);
      if (!id) { setBackgroundStatus('Não foi possível identificar um vídeo válido do YouTube neste link.', true); return; }
      showPreview({ kind: 'youtube', id, url: url.href }); return;
    }
    setBackgroundStatus('Verificando a mídia…'); $('#backgroundPreviewMessage').textContent = 'Verificando o carregamento real da mídia…';
    const extension = url.pathname.toLowerCase().split('.').pop();
    try {
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extension)) { await probeImage(url.href); showPreview({ kind: 'image', url: url.href }); }
      else if (['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'].includes(extension)) { await probeVideo(url.href); showPreview({ kind: 'video', url: url.href }); }
      else {
        try { await probeImage(url.href); showPreview({ kind: 'image', url: url.href }); }
        catch { await probeVideo(url.href); showPreview({ kind: 'video', url: url.href }); }
      }
    } catch (error) { setBackgroundStatus(error.message || 'A mídia não pôde ser validada.', true); $('#backgroundPreviewMessage').textContent = 'A prévia falhou. Confira o link, o acesso público e o formato suportado.'; }
  }
  function clearBackgroundMedia() {
    const video = $('#sceneVideo'); video.pause(); video.removeAttribute('src'); video.load(); video.style.opacity = '0';
    const image = $('#sceneImage'); image.hidden = true; image.removeAttribute('src');
    const youtube = $('#youtubeBackground'); youtube.hidden = true; youtube.removeAttribute('src');
    if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl = null;
  }
  function applyScene(name) {
    activeScene = name; const scene = scenes[name]; clearBackgroundMedia(); $('#sceneEyebrow').textContent = scene.title; $('#quoteText').textContent = scene.quote;
    $('.scene-fallback').style.backgroundImage = `linear-gradient(130deg,rgba(12,22,18,.2),rgba(8,13,12,.3)),url("${scene.image}")`;
    $$('.scene-option').forEach(button => button.classList.toggle('selected', button.dataset.scene === name));
    save('deepFocusScene', name); save('deepFocusBackground', null); localStorage.removeItem('deepFocusVideoUrl');
  }
  async function renderBackground(record) {
    if (!record || !record.kind) { applyScene(activeScene); setBackgroundStatus('Fundo padrão ativo.'); return; }
    clearBackgroundMedia();
    if (record.kind === 'youtube') {
      const iframe = $('#youtubeBackground'); iframe.src = youtubeEmbedUrl(record.id, true); iframe.hidden = false;
      $('#sceneEyebrow').textContent = 'VÍDEO DO YOUTUBE';
      setBackgroundStatus(location.protocol === 'file:' ? 'O YouTube exige que o app seja aberto pelo Live Server ou por um endereço HTTP/HTTPS; páginas file:// não podem incorporar o player.' : 'Reprodução solicitada. O vídeo precisa permitir incorporação e autoplay silencioso.');
    } else if (record.kind === 'image' || record.kind === 'video' || record.kind === 'local-image' || record.kind === 'local-video') {
      let source = record.url;
      if (record.kind.startsWith('local-')) {
        try { const blob = await readLocalBackground(); if (!blob) throw new Error('Arquivo local não encontrado.'); source = backgroundObjectUrl = URL.createObjectURL(blob); }
        catch { save('deepFocusBackground', null); applyScene(activeScene); setBackgroundStatus('O arquivo local não está disponível. Selecione-o novamente.', true); return; }
      }
      if (record.kind === 'image' || record.kind === 'local-image') {
        const image = $('#sceneImage'); image.onerror = () => { image.hidden = true; setBackgroundStatus('A imagem de fundo falhou. O restante do aplicativo segue funcionando.', true); }; image.onload = () => { image.hidden = false; };
        image.src = source; image.hidden = false; $('#sceneEyebrow').textContent = 'FUNDO PERSONALIZADO';
      } else {
        const video = $('#sceneVideo'); video.onerror = () => { video.style.opacity = '0'; setBackgroundStatus('O vídeo falhou ou não é compatível. O fundo padrão continua disponível.', true); };
        video.src = source; video.style.opacity = '.55'; video.load(); video.play().catch(() => setBackgroundStatus('O navegador bloqueou a reprodução automática do vídeo.', true)); $('#sceneEyebrow').textContent = 'VÍDEO PERSONALIZADO';
      }
      setBackgroundStatus(record.kind.startsWith('local-') ? 'Arquivo local ativo neste navegador.' : 'Fundo remoto ativo.');
    }
    $$('.scene-option').forEach(button => button.classList.remove('selected'));
  }
  async function applyPreviewBackground() {
    if (!previewAsset || !previewAsset.validated) { setBackgroundStatus('Aguarde a validação da prévia antes de aplicar.', true); return; }
    const asset = previewAsset;
    try {
      let record; const removePreviousLocalFile = !asset.file;
      if (asset.file) { await storeLocalBackground(asset.file); record = { kind: asset.kind === 'image' ? 'local-image' : 'local-video' }; }
      else record = asset.kind === 'youtube' ? { kind: 'youtube', id: asset.id } : { kind: asset.kind, url: asset.url };
      save('deepFocusBackground', record); localStorage.removeItem('deepFocusVideoUrl');
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null; previewAsset = null;
      const rendering = renderBackground(record);
      if (removePreviousLocalFile) await deleteLocalBackground();
      await rendering;
      $('#backgroundPreviewMessage').textContent = 'Fundo aplicado.';
    } catch (error) { setBackgroundStatus(error.message || 'Não foi possível salvar o arquivo neste navegador.', true); }
  }
  async function restoreDefaultBackground() {
    save('deepFocusBackground', null); localStorage.removeItem('deepFocusVideoUrl'); await deleteLocalBackground(); clearPreview(); applyScene(activeScene); setBackgroundStatus('Fundo padrão restaurado.');
  }
  function durationFor(which = mode) { return (which === 'focus' ? settings.focus : which === 'short' ? settings.short : settings.long) * 60; }
  function fmt(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function renderTimer() {
    $('#timerDisplay').textContent = fmt(remaining);
    $('#progressBar').style.width = `${total ? Math.min(100, Math.max(0, (1 - remaining / total) * 100)) : 0}%`;
    $('#timerStatus').textContent = running ? (mode === 'focus' ? 'SESSÃO DE FOCO EM ANDAMENTO' : 'MOMENTO DE PAUSA') : remaining === total ? 'PRONTO PARA COMEÇAR' : 'SESSÃO PAUSADA';
    $('#startLabel').textContent = running ? 'Pausar sessão' : (remaining < total ? 'Continuar foco' : mode === 'focus' ? 'Começar foco' : 'Começar pausa');
    $('#startIcon').innerHTML = running ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="m8 5 11 7-11 7z"/>';
    $('#sessionCount').textContent = `${completed} ${completed === 1 ? 'sessão concluída' : 'sessões concluídas'}`;
    $('#cycleLabel').textContent = `CICLO ${Math.min(settings.cycle, cycleProgress + 1)} DE ${settings.cycle}`;
    document.title = `${fmt(remaining)} · Deep Focus`;
  }
  function stopTicker() { if (interval) clearInterval(interval); interval = null; }
  function tick() {
    if (!running) return;
    remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    renderTimer();
    if (remaining <= 0) finishMode();
  }
  function start() {
    activateAudio();
    if (running) { running = false; stopTicker(); renderTimer(); return; }
    running = true; deadline = Date.now() + remaining * 1000;
    stopTicker(); interval = setInterval(tick, 200); renderTimer();
  }
  function setMode(next, announce = false) {
    mode = next; running = false; stopTicker(); total = durationFor(mode); remaining = total;
    $$('.timer-tab').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    renderTimer(); if (announce) toast(mode === 'focus' ? 'Hora de focar.' : 'Permita-se fazer uma pausa.');
  }
  function finishMode() {
    running = false; stopTicker(); remaining = 0; renderTimer();
    try { const ctx = audioContext; if (ctx) { const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 660; gain.gain.value = .07; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .18); } } catch {}
    if (mode === 'focus') { completed++; cycleProgress++; save('deepFocusCompleted', completed); save('deepFocusCycleProgress', cycleProgress % settings.cycle); toast('Sessão concluída. Bom trabalho.'); setTimeout(() => setMode(cycleProgress % settings.cycle === 0 ? 'long' : 'short'), 700); }
    else { toast('Pausa concluída. Pronto para voltar?'); setTimeout(() => setMode('focus'), 700); }
  }
  function reset() { running = false; stopTicker(); total = durationFor(); remaining = total; renderTimer(); }
  function skip() { if (mode === 'focus') { cycleProgress++; save('deepFocusCycleProgress', cycleProgress % settings.cycle); setMode(cycleProgress % settings.cycle === 0 ? 'long' : 'short', true); } else setMode('focus', true); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => el.classList.remove('show'), 2600); }

  function spotifyEmbedPath(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['open.spotify.com', 'www.open.spotify.com'].includes(url.hostname.toLowerCase())) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0]?.startsWith('intl-')) parts.shift();
      if (parts.length !== 2 || !['track', 'album', 'playlist', 'episode', 'show'].includes(parts[0]) || !/^[a-zA-Z0-9]{10,32}$/.test(parts[1])) return null;
      return `${parts[0]}/${parts[1]}`;
    } catch {
      return null;
    }
  }
  function renderSpotify(path) {
    const validPath = /^(track|album|playlist|episode|show)\/[a-zA-Z0-9]{10,32}$/.test(path) ? path : null;
    const player = $('#spotifyPlayer');
    const disconnect = $('#spotifyDisconnectBtn');
    const frame = $('#spotifyFrame');
    player.hidden = !validPath;
    disconnect.hidden = !validPath;
    if (validPath) {
      frame.src = `https://open.spotify.com/embed/${validPath}?utm_source=generator`;
      $('#spotifyStatus').textContent = 'Player conectado. A reprodução pode exigir uma conta Spotify.';
      $('#spotifyUrlInput').value = `https://open.spotify.com/${validPath}`;
    } else {
      frame.removeAttribute('src');
      $('#spotifyUrlInput').value = '';
    }
  }
  $('#spotifyForm').addEventListener('submit', event => {
    event.preventDefault();
    const path = spotifyEmbedPath($('#spotifyUrlInput').value.trim());
    if (!path) {
      $('#spotifyStatus').textContent = 'Link inválido. Use um link HTTPS de faixa, álbum, playlist, episódio ou programa do Spotify.';
      return;
    }
    save('deepFocusSpotify', path);
    renderSpotify(path);
  });
  $('#spotifyDisconnectBtn').addEventListener('click', () => {
    localStorage.removeItem('deepFocusSpotify');
    renderSpotify(null);
    $('#spotifyStatus').textContent = 'Player desconectado.';
  });

  // Procedural ambient layers are generated locally with Web Audio; no audio files or accounts required.
  function noiseBuffer(ctx, seconds = 3) { const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; return buffer; }
  function makeNoiseLayer(name, type) {
    const ctx = audioContext; const source = ctx.createBufferSource(); source.buffer = noiseBuffer(ctx); source.loop = true;
    const filter = ctx.createBiquadFilter(); const gain = ctx.createGain(); gain.gain.value = 0;
    if (type === 'rain') { filter.type = 'lowpass'; filter.frequency.value = 3600; filter.Q.value = .3; }
    if (type === 'wind') { filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = .7; }
    if (type === 'fire') { filter.type = 'lowpass'; filter.frequency.value = 1800; filter.Q.value = .5; }
    if (type === 'birds') { filter.type = 'bandpass'; filter.frequency.value = 2500; filter.Q.value = .7; }
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start();
    if (type === 'wind') { const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain(); lfo.frequency.value = .13; lfoGain.gain.value = .12; lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start(); audioNodes[name] = { source, filter, gain, lfo, lfoGain }; }
    else audioNodes[name] = { source, filter, gain };
  }
  async function activateAudio() {
    if (!audioContext) { const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) { $('#audioHint').textContent = 'Este navegador não suporta áudio ambiente.'; return; } audioContext = new AudioCtx(); Object.keys(volumes).forEach(name => makeNoiseLayer(name, name)); }
    if (audioContext.state === 'suspended') await audioContext.resume();
    masterOn = true; applyVolumes(); $('#audioHint').textContent = 'Sons ambientes gerados no navegador. Ajuste cada camada.'; $('#masterSoundBtn').style.opacity = '1';
  }
  function applyVolumes() { Object.entries(volumes).forEach(([name, value]) => { if (audioNodes[name]) audioNodes[name].gain.gain.setTargetAtTime(masterOn ? (value / 100) * (name === 'fire' ? .055 : name === 'birds' ? .035 : name === 'wind' ? .09 : .12) : 0, audioContext.currentTime, .08); }); }
  $('#masterSoundBtn').addEventListener('click', async () => { if (!audioContext) await activateAudio(); else { masterOn = !masterOn; applyVolumes(); $('#audioHint').textContent = masterOn ? 'Sons ambientes ativados.' : 'Sons ambientes silenciados.'; $('#masterSoundBtn').style.opacity = masterOn ? '1' : '.5'; } });
  $$('[data-volume]').forEach(input => {
    const name = input.dataset.volume; input.value = volumes[name]; $(`#${name}Value`).textContent = `${input.value}%`;
    input.addEventListener('input', () => { volumes[name] = Number(input.value); $(`#${name}Value`).textContent = `${input.value}%`; save('deepFocusVolumes', volumes); if (audioContext) applyVolumes(); });
  });
  $('#startBtn').addEventListener('click', start);
  $('#resetBtn').addEventListener('click', reset);
  $('#skipBtn').addEventListener('click', skip);
  $$('.timer-tab').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('#taskInput').value = read('deepFocusTask') || '';
  $('#taskInput').addEventListener('input', () => { save('deepFocusTask', $('#taskInput').value); $('#taskSaved').textContent = 'SALVO'; clearTimeout($('#taskInput').saveTimer); $('#taskInput').saveTimer = setTimeout(() => $('#taskSaved').textContent = 'SALVO AUTOMATICAMENTE', 1100); });
  $$('.scene-option').forEach(button => button.addEventListener('click', () => applyScene(button.dataset.scene)));
  $('#fullscreenBtn').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { toast('Tela cheia não disponível neste navegador.'); } });
  function openModal(id) { $(`#${id}`).hidden = false; }
  function closeModal(id) { $(`#${id}`).hidden = true; }
  $('#settingsBtn').addEventListener('click', () => openModal('settingsModal'));
  $('#videoBtn').addEventListener('click', () => { $('#videoUrlInput').focus(); openModal('settingsModal'); });
  $('#previewBackgroundBtn').addEventListener('click', previewUrl);
  $('#backgroundImageFile').addEventListener('change', () => {
    const file = $('#backgroundImageFile').files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { setBackgroundStatus('Selecione um arquivo de imagem compatível.', true); return; }
    showPreview({ kind: 'image', file });
  });
  $('#backgroundVideoFile').addEventListener('change', () => {
    const file = $('#backgroundVideoFile').files[0]; if (!file) return;
    if (!file.type.startsWith('video/')) { setBackgroundStatus('Selecione um arquivo de vídeo compatível.', true); return; }
    showPreview({ kind: 'video', file });
  });
  $('#restoreBackgroundBtn').addEventListener('click', restoreDefaultBackground);
  $('#applyBackgroundBtn').addEventListener('click', applyPreviewBackground);
  $$('[data-close]').forEach(button => button.addEventListener('click', () => { clearPreview(); closeModal(button.dataset.close); }));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) { backdrop.hidden = true; clearPreview(); } }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $$('.modal-backdrop').forEach(el => el.hidden = true); clearPreview(); } if (event.code === 'Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)) { event.preventDefault(); start(); } });
  $('#focusMinutes').value = settings.focus; $('#shortMinutes').value = settings.short; $('#longMinutes').value = settings.long; $('#cycleSessions').value = settings.cycle; $('#videoUrlInput').value = read('deepFocusVideoUrl') || '';
  $('#saveSettingsBtn').addEventListener('click', () => {
    const val = (id, min, max, fallback) => { const n = Number($(id).value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; };
    const previousSettings = { ...settings };
    settings = { focus: val('#focusMinutes', 1, 180, defaults.focus), short: val('#shortMinutes', 1, 60, defaults.short), long: val('#longMinutes', 1, 90, defaults.long), cycle: val('#cycleSessions', 2, 8, defaults.cycle) };
    const timerSettingsChanged = Object.keys(settings).some(key => settings[key] !== previousSettings[key]);
    save('deepFocusSettings', settings);
    if (timerSettingsChanged) reset();
    closeModal('settingsModal'); clearPreview(); toast('Configurações salvas.');
  });
  function updateClock() { $('#clock').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
  const storedScene = read('deepFocusScene'); if (storedScene && scenes[storedScene]) activeScene = storedScene;
  const storedSpotify = read('deepFocusSpotify');
  if (typeof storedSpotify === 'string' && /^(track|album|playlist|episode|show)\/[a-zA-Z0-9]{10,32}$/.test(storedSpotify)) renderSpotify(storedSpotify);
  const storedBackground = read('deepFocusBackground');
  if (storedBackground) renderBackground(storedBackground);
  else if (read('deepFocusVideoUrl')) {
    const legacyUrl = validHttpUrl(read('deepFocusVideoUrl'));
    if (legacyUrl) { const legacy = { kind: 'video', url: legacyUrl.href }; save('deepFocusBackground', legacy); renderBackground(legacy); }
    else applyScene(activeScene);
  } else applyScene(activeScene);
  renderTimer(); updateClock(); setInterval(updateClock, 15000);
})();
