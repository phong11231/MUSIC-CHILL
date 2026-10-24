// ===== Go phim kieu Monkeytype: go het doan van tu chon roi xem ket qua =====
(() => {
  const $ = id => document.getElementById(id);
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ===== Doan van da luu =====
  const DEFAULT = [{
    id: 'mau', name: 'Đoạn mẫu',
    text: 'Có những ngày chỉ cần một bản nhạc hay và một bàn phím quen tay là đủ. Gõ chậm mà chắc, đúng rồi mới nhanh, nhanh rồi sẽ đẹp.'
  }];
  let texts = load('tt.texts', DEFAULT);
  if (!Array.isArray(texts) || !texts.length) texts = DEFAULT.slice();
  const cfg = Object.assign({ textId: texts[0].id, noTone: false }, load('tt.cfg', {}));
  if (!texts.some(t => t.id === cfg.textId)) cfg.textId = texts[0].id;

  // ===== Dong bo cac doan len GitHub: texts.json trong repo, dung chung token voi danh sach nhac =====
  const GH_TEXTS = 'https://api.github.com/repos/phong11231/MUSIC-CHILL/contents/texts.json';
  const token = () => { try { return localStorage.getItem('scLoop.ghToken') || ''; } catch (e) { return ''; } };
  const enc = str => btoa(unescape(encodeURIComponent(str)));
  const dec = b => decodeURIComponent(escape(atob(b.replace(/\s/g, ''))));
  let textsSha = null, pushT = null;
  function setTextSync(state, msg) {
    $('ttSync').className = 'tt-sync ' + state;
    $('ttSync').title = msg;
    $('edSync').textContent = msg;
  }
  async function pullTexts() {
    const h = { Accept: 'application/vnd.github+json' };
    if (token()) h.Authorization = 'Bearer ' + token();
    const r = await fetch(GH_TEXTS + '?ref=main&t=' + Date.now(), { headers: h, cache: 'no-store' });
    if (r.status === 404) { textsSha = null; return null; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    textsSha = j.sha;
    return JSON.parse(dec(j.content));
  }
  async function pushTexts(retry = true) {
    if (!token()) return setTextSync('err', 'Chỉ lưu trên máy này (chưa kết nối GitHub ở tab Nhạc)');
    setTextSync('busy', 'Đang lưu lên GitHub...');
    const body = { message: 'Cap nhat doan go phim', content: enc(JSON.stringify(texts, null, 2) + '\n'), branch: 'main' };
    if (textsSha) body.sha = textsSha;
    try {
      const r = await fetch(GH_TEXTS, { method: 'PUT', headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' }, body: JSON.stringify(body) });
      if ((r.status === 409 || r.status === 422) && retry) { await pullTexts(); return pushTexts(false); }
      if (r.status === 401 || r.status === 403) return setTextSync('err', 'Token sai hoặc không có quyền ghi');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      textsSha = (await r.json()).content.sha;
      setTextSync('ok', 'Đã lưu lên GitHub');
    } catch (e) {
      setTextSync('err', 'Lỗi lưu GitHub: ' + e.message);
    }
  }
  const saveTexts = () => { store('tt.texts', texts); clearTimeout(pushT); pushT = setTimeout(pushTexts, 800); };
  async function loadTexts() {
    try {
      const remote = await pullTexts();
      if (Array.isArray(remote) && remote.length) {
        texts = remote; store('tt.texts', texts);
        if (!texts.some(t => t.id === cfg.textId)) cfg.textId = texts[0].id;
        renderBar();
        if (!started) newTest();
        setTextSync('ok', `Đã tải ${texts.length} đoạn từ GitHub`);
      } else if (texts.some(t => t.id !== 'mau')) {
        pushTexts();     // GitHub chua co file -> day cac doan dang co tren may len
      } else {
        setTextSync('ok', 'Chưa có đoạn nào trên GitHub');
      }
    } catch (e) {
      setTextSync('err', 'Không tải được từ GitHub, đang dùng bản trên máy');
    }
  }
  const saveCfg = () => store('tt.cfg', cfg);
  const curText = () => texts.find(t => t.id === cfg.textId) || texts[0];

  // ===== Trang thai bai go =====
  const wrap = $('ttWrap'), inner = $('ttWords'), caret = $('ttCaret'), input = $('ttInput');
  let words = [], typed = [], els = [], idx = 0;
  let started = false, finished = false, t0 = 0, timer = null, idleTimer = null;
  let ks = { ok: 0, bad: 0 };          // so phim go dung / sai
  let secChars = 0, secErr = 0, samples = [];   // thong ke tung giay cho bieu do
  let prev = '';

  const viMode = () => !cfg.noTone && /[^\x00-\x7f]/.test(curText().text);  // doan co dau -> cho phep trang thai "dang go dau"
  const near = (a, b) => a === b || (viMode() && strip(a) === strip(b));

  function prepareWords() {
    let t = curText().text.replace(/\s+/g, ' ').trim();
    if (cfg.noTone) t = strip(t);
    return t ? t.split(' ') : ['(trống)'];
  }

  // ===== Ve chu =====
  function wordHTML(i) {
    const target = words[i], t = typed[i] || '';
    const active = i === idx && !finished;
    let h = '';
    for (let k = 0; k < target.length; k++) {
      let c = '';
      if (k < t.length) {
        if (t[k] === target[k]) c = 'ok';
        else if (active && viMode() && strip(t[k]) === strip(target[k])) c = 'pend';  // vua go "a", dang cho bo dau thanh "a'"
        else c = 'bad';
      }
      h += `<span class="${c}">${esc(target[k])}</span>`;
    }
    for (let k = target.length; k < Math.min(t.length, target.length + 12); k++) h += `<span class="extra">${esc(t[k])}</span>`;
    return h;
  }
  function paint(i) {
    const el = els[i]; if (!el) return;
    el.innerHTML = wordHTML(i);
    el.classList.toggle('err', i < idx && typed[i] !== words[i]);
  }

  function placeCaret() {
    const el = els[idx]; if (!el) return;
    const t = typed[idx] || '';
    const spans = el.children;
    const ir = inner.getBoundingClientRect();
    const r = spans[Math.min(t.length, spans.length - 1)].getBoundingClientRect();
    const x = t.length < spans.length ? r.left : r.right;
    caret.style.left = (x - ir.left) + 'px';
    caret.style.top = (r.top - ir.top + (r.height - caret.offsetHeight) / 2) + 'px';
  }

  // Chi hien 2 dong: dong dang go o tren, dong ke tiep o duoi
  function scrollLines() {
    const el = els[idx]; if (!el) return;
    const lh = el.offsetHeight;
    const line = Math.round(el.offsetTop / lh);
    inner.style.transform = `translateY(${-line * lh}px)`;
  }

  function wake() {
    caret.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => caret.classList.add('idle'), 700);
  }

  // ===== Thong ke =====
  function counts() {
    let good = 0, all = 0;
    const c = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    const upto = finished ? words.length : idx;
    for (let i = 0; i < upto; i++) {
      const w = words[i], t = typed[i] || '';
      const space = i < words.length - 1 ? 1 : 0;
      if (t === w) good += w.length + space;
      all += t.length + space;
      for (let k = 0; k < Math.max(w.length, t.length); k++) {
        if (k >= t.length) c.missed++;
        else if (k >= w.length) c.extra++;
        else if (t[k] === w[k]) c.correct++;
        else c.incorrect++;
      }
    }
    if (!finished && idx < words.length) {   // tu dang go do
      const w = words[idx], t = typed[idx] || '';
      all += t.length;
      if (t && w.startsWith(t)) good += t.length;
    }
    return { good, all, c };
  }
  const elapsed = () => (performance.now() - t0) / 1000;
  function speed(sec) {
    const n = counts(), m = Math.max(sec, .5) / 60;
    return { wpm: n.good / 5 / m, raw: n.all / 5 / m, c: n.c };
  }

  function pushSample() {
    const s = samples.length + 1;
    samples.push({ s, wpm: speed(s).wpm, raw: secChars / 5 * 60, err: secErr });
    secChars = 0; secErr = 0;
  }

  function tickTest() {
    const t = elapsed();
    while (samples.length < Math.floor(t)) pushSample();
    updateLive();
  }
  function updateLive() {
    const done = Math.min(idx, words.length);
    $('ttProg').textContent = `${done}/${words.length}`;
    $('ttBar').style.width = (words.length ? done / words.length * 100 : 0) + '%';
    $('ttLiveWpm').textContent = started ? Math.round(speed(elapsed()).wpm) + ' wpm' : '— wpm';
  }

  // ===== Nhap lieu (dung o nhap an de bo go Unikey/Telex hoat dong binh thuong) =====
  function judgeNew(v) {
    if (v.length <= prev.length) return;      // xoa, hoac bo go thay chu (vd. e -> e^) -> khong tinh phim
    const target = words[idx];
    for (let k = prev.length; k < v.length; k++) {
      secChars++;
      if (k < target.length && near(v[k], target[k])) ks.ok++;
      else { ks.bad++; secErr++; }
    }
  }

  function onType(v) {
    judgeNew(v);
    typed[idx] = v; prev = v;
    paint(idx); placeCaret(); updateLive(); wake();
    // Tu cuoi go dung -> xong luon, khong can bam cach
    if (idx === words.length - 1 && v === words[idx]) commit();
  }

  function commit() {
    if (idx < words.length - 1) { ks.ok++; secChars++; }   // phim cach
    // Luc go duoc tam chap nhan sai dau (cho bo go them dau); chot tu ma van sai dau -> tinh la loi
    const w = words[idx], t = typed[idx] || '';
    for (let k = 0; k < Math.min(w.length, t.length); k++) if (t[k] !== w[k] && near(t[k], w[k])) { ks.ok--; ks.bad++; }
    const i = idx;
    idx++;
    paint(i);
    input.value = ''; prev = '';
    if (idx >= words.length) return finish();
    paint(idx); scrollLines(); placeCaret(); updateLive(); wake();
  }

  input.addEventListener('input', () => {
    if (finished) { input.value = ''; return; }
    const v = input.value;
    if (!started) {
      if (!v.trim()) { input.value = ''; return; }
      start();
    }
    // Xu ly lan luot tung tu (go nhanh / dan ca cum chu / bo go day nhieu ky tu mot luc)
    let rest = v;
    while (!finished) {
      const sp = rest.indexOf(' ');
      if (sp === -1) { onType(rest); break; }
      const before = rest.slice(0, sp);
      rest = rest.slice(sp + 1);
      if (!before) continue;            // bo qua dau cach thua
      onType(before);
      if (finished) break;
      commit();
    }
    if (!finished && input.value !== prev) input.value = prev;
  });

  input.addEventListener('keydown', e => {
    // Xoa luc o trong -> quay lai tu truoc neu tu do go sai
    if (e.key === 'Backspace' && !input.value && idx > 0 && !finished && typed[idx - 1] !== words[idx - 1]) {
      e.preventDefault();
      typed[idx] = ''; paint(idx);
      idx--;
      input.value = prev = typed[idx] || '';
      paint(idx); scrollLines(); placeCaret(); updateLive();
    }
  });

  input.addEventListener('focus', () => wrap.classList.remove('blurred'));
  input.addEventListener('blur', () => { if (!finished) wrap.classList.add('blurred'); });
  wrap.addEventListener('mousedown', e => { e.preventDefault(); input.focus(); });

  function start() {
    started = true;
    t0 = performance.now();
    document.body.classList.add('tt-running');
    timer = setInterval(tickTest, 200);
  }

  // ===== Ket thuc + ket qua =====
  const pbKey = () => cfg.textId + (cfg.noTone ? ':0' : '');
  function finish() {
    finished = true;
    clearInterval(timer);
    document.body.classList.remove('tt-running');
    const t = elapsed();
    if (secChars || !samples.length) pushSample();
    const r = speed(t);
    const acc = ks.ok + ks.bad ? ks.ok / (ks.ok + ks.bad) * 100 : 100;
    const raws = samples.map(s => s.raw);
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length);
    const cv = mean ? sd / mean : 0;
    const cons = Math.max(0, 100 * (1 - Math.tanh(cv + cv ** 3 / 3 + cv ** 5 / 5)));

    const pbs = load('tt.pb', {});
    const old = pbs[pbKey()];
    const isPb = !old || r.wpm > old.wpm;
    if (isPb) { pbs[pbKey()] = { wpm: r.wpm, acc, date: Date.now() }; store('tt.pb', pbs); }

    $('rWpm').textContent = Math.round(r.wpm);
    $('rAcc').textContent = Math.round(acc) + '%';
    $('rRaw').textContent = Math.round(r.raw);
    $('rChars').textContent = `${r.c.correct}/${r.c.incorrect}/${r.c.extra}/${r.c.missed}`;
    $('rCons').textContent = Math.round(cons) + '%';
    $('rTime').textContent = t < 60 ? t.toFixed(1) + 's' : Math.floor(t / 60) + 'm ' + Math.round(t % 60) + 's';
    $('rText').textContent = curText().name + (cfg.noTone ? ' · không dấu' : '');
    $('rPb').innerHTML = isPb
      ? (old ? `🏆 Kỷ lục mới! <b>${Math.round(r.wpm)}</b> wpm (cũ ${Math.round(old.wpm)})` : '🏆 Kỷ lục đầu tiên cho đoạn này')
      : `Kỷ lục đoạn này: <b>${Math.round(old.wpm)}</b> wpm`;
    $('rPb').classList.toggle('new', isPb);
    const song = document.body.classList.contains('playing') ? $('npTitle').textContent : '';
    $('rSong').textContent = song ? '♪ Đang nghe: ' + song : '';

    $('ttStage').hidden = true;
    $('ttResult').hidden = false;
    drawChart();
  }

  function drawChart() {
    const svg = $('rChart');
    const W = svg.clientWidth || 600, H = svg.clientHeight || 220;
    const pad = { l: 34, r: 30, t: 12, b: 24 };
    const n = samples.length;
    const maxY = Math.max(10, ...samples.map(s => Math.max(s.wpm, s.raw))) * 1.12;
    const maxE = Math.max(1, ...samples.map(s => s.err));
    const x = i => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
    const y = v => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
    const ye = v => H - pad.b - (v / maxE) * (H - pad.t - pad.b);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxY / 1.12 * k / 4, yy = y(v);
      g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${pad.l - 8}" y="${yy + 4}" class="ax" text-anchor="end">${Math.round(v)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    samples.forEach((s, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${s.s}</text>`; });
    const line = key => samples.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join('');
    const area = n ? `${line('wpm')}L${x(n - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z` : '';
    const errs = samples.map((s, i) => s.err ? `<text x="${x(i)}" y="${ye(s.err) + 4}" class="errm" text-anchor="middle">×<title>giây ${s.s}: ${s.err} lỗi</title></text>` : '').join('');
    const dots = samples.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.wpm)}" r="3" class="dot"><title>giây ${s.s}: ${Math.round(s.wpm)} wpm · raw ${Math.round(s.raw)}</title></circle>`).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs><linearGradient id="ttArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a4a" stop-opacity=".35"/><stop offset="1" stop-color="#ff5a4a" stop-opacity="0"/></linearGradient></defs>
      ${g}<path d="${area}" fill="url(#ttArea)"/><path d="${line('raw')}" class="rawl"/><path d="${line('wpm')}" class="wpml"/>${dots}${errs}`;
  }

  // ===== Bat dau bai moi =====
  function newTest() {
    clearInterval(timer);
    started = finished = false;
    document.body.classList.remove('tt-running');
    words = prepareWords(); typed = []; els = []; idx = 0;
    ks = { ok: 0, bad: 0 }; samples = []; secChars = secErr = 0; prev = '';
    input.value = '';
    inner.innerHTML = '';
    inner.style.transform = '';
    const frag = document.createDocumentFragment();
    words.forEach(() => { const el = document.createElement('div'); el.className = 'w'; frag.appendChild(el); els.push(el); });
    inner.appendChild(frag);
    inner.appendChild(caret);
    words.forEach((_, i) => paint(i));
    $('ttResult').hidden = true;
    $('ttStage').hidden = false;
    const pb = load('tt.pb', {})[pbKey()];
    $('ttName').textContent = curText().name;
    $('ttMeta').textContent = `${words.length} từ` + (cfg.noTone ? ' · không dấu' : '') + (pb ? ` · kỷ lục ${Math.round(pb.wpm)} wpm` : '');
    updateLive();
    requestAnimationFrame(() => { placeCaret(); focusInput(); });
  }

  function focusInput() {
    if (!document.body.classList.contains('v-type') || !$('ttEditor').hidden) return;
    input.focus({ preventScroll: true });
    if (document.activeElement !== input) wrap.classList.add('blurred');
  }

  // ===== Thanh chon doan =====
  function renderBar() {
    $('ttPick').innerHTML = texts.map(t => `<option value="${esc(t.id)}"${t.id === cfg.textId ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    $('ttNoTone').classList.toggle('on', cfg.noTone);
    $('ttSize').textContent = SIZES[cfg.size] + 'px';
    $('ttFont').textContent = cfg.font === 'sans' ? 'sans' : 'mono';
  }
  $('ttPick').addEventListener('change', e => { cfg.textId = e.target.value; saveCfg(); newTest(); });
  $('ttNoTone').addEventListener('click', () => { cfg.noTone = !cfg.noTone; saveCfg(); renderBar(); newTest(); });

  // ===== Co chu + kieu chu =====
  const SIZES = [24, 32, 42, 56, 72, 96];
  if (!(cfg.size in SIZES)) cfg.size = 3;
  function applyLook() {
    const px = SIZES[cfg.size];
    // Man hinh hep tu thu nho: toi thieu ~20px, theo be ngang, toi da bang co da chon
    wrap.style.setProperty('--fs', `clamp(${Math.min(px, 20)}px, ${(px / 10).toFixed(2)}vw, ${px}px)`);
    wrap.classList.toggle('sans', cfg.font === 'sans');
    renderBar();
    requestAnimationFrame(() => { scrollLines(); placeCaret(); });
  }
  const look = fn => () => { fn(); saveCfg(); applyLook(); focusInput(); };
  $('ttSmaller').addEventListener('click', look(() => { cfg.size = Math.max(0, cfg.size - 1); }));
  $('ttBigger').addEventListener('click', look(() => { cfg.size = Math.min(SIZES.length - 1, cfg.size + 1); }));
  $('ttFont').addEventListener('click', look(() => { cfg.font = cfg.font === 'sans' ? 'mono' : 'sans'; }));

  // ===== Khung soan doan =====
  let editingId = null;
  function openEditor(id) {
    editingId = id;
    const t = id ? texts.find(x => x.id === id) : null;
    $('edName').value = t ? t.name : '';
    $('edText').value = t ? t.text : '';
    $('edDel').hidden = !t || texts.length < 2;
    $('edTitle').textContent = t ? 'Sửa đoạn' : 'Đoạn mới';
    $('ttEditor').hidden = false;
    updateCount();
    setTimeout(() => (t ? $('edText') : $('edName')).focus(), 30);
  }
  function closeEditor() { $('ttEditor').hidden = true; focusInput(); }
  function updateCount() {
    const n = $('edText').value.trim() ? $('edText').value.trim().split(/\s+/).length : 0;
    $('edCount').textContent = n + ' từ';
  }
  $('edText').addEventListener('input', updateCount);
  $('ttEdit').addEventListener('click', () => openEditor(cfg.textId));
  $('ttNew').addEventListener('click', () => openEditor(null));
  $('edCancel').addEventListener('click', closeEditor);
  $('ttEditor').addEventListener('mousedown', e => { if (e.target.id === 'ttEditor') closeEditor(); });
  $('edSave').addEventListener('click', () => {
    const text = $('edText').value.replace(/\s+/g, ' ').trim();
    if (!text) { $('edText').focus(); return; }
    const name = $('edName').value.trim() || text.split(' ').slice(0, 5).join(' ') + '…';
    if (editingId) Object.assign(texts.find(x => x.id === editingId), { name, text });
    else { editingId = 't' + Date.now().toString(36); texts.push({ id: editingId, name, text }); }
    cfg.textId = editingId;
    saveTexts(); saveCfg(); renderBar();
    $('ttEditor').hidden = true;
    newTest();
  });
  $('edDel').addEventListener('click', () => {
    if (!editingId || texts.length < 2 || !confirm('Xoá đoạn này?')) return;
    texts = texts.filter(x => x.id !== editingId);
    cfg.textId = texts[0].id;
    saveTexts(); saveCfg(); renderBar();
    $('ttEditor').hidden = true;
    newTest();
  });

  // ===== Phim tat =====
  $('ttRestart').addEventListener('click', newTest);
  $('rAgain').addEventListener('click', newTest);
  document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('v-type')) return;
    if (!$('ttEditor').hidden) {
      if (e.key === 'Escape') closeEditor();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('edSave').click();
      return;
    }
    if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); newTest(); return; }
    if (!$('ttResult').hidden) { if (e.key === 'Enter') { e.preventDefault(); newTest(); } return; }
    const ae = document.activeElement;
    if (ae === input || (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT'))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) input.focus();   // phim dau tien se roi vao o nhap
  });
  window.addEventListener('resize', () => { if (!finished) { scrollLines(); placeCaret(); } else drawChart(); });

  window.TT = { onShow() { if (!finished) { scrollLines(); placeCaret(); focusInput(); } } };

  applyLook();
  newTest();
  loadTexts();
  if (document.fonts) document.fonts.ready.then(() => { scrollLines(); placeCaret(); });
})();
