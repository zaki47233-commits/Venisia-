const $ = (id) => document.getElementById(id);
const state = { original: null, current: null, bg: 'remove', platforms: new Set(['tiktok', 'instagram', 'facebook']) };

function toast(msg, ok = true) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.display = 'none'), 4500);
}

function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function dataUrlToBlob(url) { return (await fetch(url)).blob(); }

function setImage(url) {
  state.current = url;
  $('preview').src = url;
  $('preview').style.display = 'block';
  ['enhanceBtn', 'captionBtn', 'publishBtn'].forEach((id) => ($(id).disabled = false));
  $('resetBtn').style.display = state.current !== state.original ? 'inline-block' : 'none';
}

async function api(path, options) {
  const r = await fetch(path, options);
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || data.message || 'حدث خطأ');
  return data;
}

// حالة الإعداد
api('/api/status').then((s) => {
  const missing = [];
  if (!s.image) missing.push('الصور');
  if (!s.caption) missing.push('النصوص');
  if (!s.publish) missing.push('النشر');
  if (missing.length) $('status').innerHTML = '<b>⚠ مفاتيح ناقصة في .env:</b> ' + missing.join('، ');
}).catch(() => {});

// اختيار الصورة
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.original = await toDataUrl(f);
  setImage(state.original);
  $('drop').firstChild.textContent = 'تغيير الصورة';
});

// أوضاع الخلفية
$('bgModes').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  document.querySelectorAll('#bgModes .chip').forEach((x) => x.classList.remove('on'));
  c.classList.add('on');
  state.bg = c.dataset.bg;
  $('bgPrompt').style.display = state.bg === 'ai' ? 'block' : 'none';
});

// تحسين الصورة
$('enhanceBtn').addEventListener('click', async () => {
  const btn = $('enhanceBtn');
  busy(btn, true, 'جارٍ المعالجة...');
  try {
    const blob = await dataUrlToBlob(state.original);
    const fd = new FormData();
    fd.append('image', blob, 'image.png');
    fd.append('background', state.bg);
    fd.append('prompt', $('bgPrompt').value);
    const { image } = await api('/api/enhance', { method: 'POST', body: fd });
    setImage(image);
    toast('تم تحسين الصورة ✓');
  } catch (e) { toast(e.message, false); }
  busy(btn, false);
});

$('resetBtn').addEventListener('click', () => { setImage(state.original); $('resetBtn').style.display = 'none'; });

// اقتراح المنشور
$('captionBtn').addEventListener('click', async () => {
  const btn = $('captionBtn');
  busy(btn, true, 'جارٍ الكتابة...');
  try {
    const data = await api('/api/caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: state.current, language: $('lang').value, tone: $('tone').value, topic: $('topic').value }),
    });
    $('sugs').innerHTML = '';
    (data.suggestions || []).forEach((s) => {
      const full = s.text + '\n\n' + (s.hashtags || []).join(' ');
      const d = document.createElement('div');
      d.className = 'sug';
      d.textContent = s.text;
      const small = document.createElement('small');
      small.textContent = (s.hashtags || []).join(' ');
      d.appendChild(small);
      d.onclick = () => { $('text').value = full; toast('تم اختيار النص'); };
      $('sugs').appendChild(d);
    });
    if (!data.suggestions?.length) toast('لم تصل اقتراحات، حاول مرة أخرى', false);
  } catch (e) { toast(e.message, false); }
  busy(btn, false);
});

// المنصات
$('plats').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  const p = c.dataset.p;
  if (state.platforms.has(p)) { state.platforms.delete(p); c.classList.remove('on'); }
  else { state.platforms.add(p); c.classList.add('on'); }
});

// النشر
$('publishBtn').addEventListener('click', async () => {
  const btn = $('publishBtn');
  if (!state.platforms.size) return toast('اختر منصة واحدة على الأقل', false);
  busy(btn, true, 'جارٍ النشر...');
  try {
    const when = $('when').value;
    const result = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: $('text').value,
        image: state.current,
        platforms: [...state.platforms],
        scheduleDate: when ? new Date(when).toISOString() : undefined,
      }),
    });
    const errs = (result.postIds || []).filter((p) => p.status === 'error');
    if (errs.length) toast('فشل النشر على: ' + errs.map((p) => p.platform).join('، ') + ' — ' + (errs[0].message || ''), false);
    else toast(when ? 'تمت الجدولة ✓' : 'تم النشر بنجاح 🎉');
  } catch (e) { toast(e.message, false); }
  busy(btn, false);
});
