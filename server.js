import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(express.json({ limit: '25mb' }));
for (const f of ['index.html', 'app.js', 'manifest.json', 'icon.svg']) {
  app.get(f === 'index.html' ? ['/', '/index.html'] : '/' + f, (_req, res) => res.sendFile(path.join(__dirname, f)));
}

const { AYRSHARE_API_KEY, ANTHROPIC_API_KEY, PHOTOROOM_API_KEY } = process.env;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const need = (res, key, name) => {
  if (!key) {
    res.status(400).json({ error: `المفتاح ${name} غير موجود في ملف .env` });
    return false;
  }
  return true;
};

// حالة الإعداد لعرضها في الواجهة
app.get('/api/status', (_req, res) => {
  res.json({
    publish: !!AYRSHARE_API_KEY,
    caption: !!ANTHROPIC_API_KEY,
    image: !!PHOTOROOM_API_KEY,
  });
});

// تحسين الصورة + تغيير الخلفية (Photoroom)
app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!need(res, PHOTOROOM_API_KEY, 'PHOTOROOM_API_KEY')) return;
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع صورة' });

    const { background = 'remove', prompt = '' } = req.body;
    const form = new FormData();
    form.append('imageFile', new Blob([req.file.buffer], { type: req.file.mimetype }), 'image.png');
    form.append('outputSize', 'hd');

    let url;
    if (background === 'remove') {
      // إزالة الخلفية فقط (خلفية شفافة) مع تحسين الجودة
      url = 'https://sdk.photoroom.com/v1/segment';
    } else {
      // خلفية جديدة: لون أو وصف نصي يولده الذكاء الاصطناعي
      url = 'https://image-api.photoroom.com/v2/edit';
      if (background === 'ai') form.append('background.prompt', prompt || 'luxury studio background, soft light');
      else form.append('background.color', background.replace('#', ''));
      form.append('lighting.mode', 'ai.auto');
      form.append('padding', '0.1');
    }

    const r = await fetch(url, { method: 'POST', headers: { 'x-api-key': PHOTOROOM_API_KEY }, body: form });
    if (!r.ok) return res.status(502).json({ error: `فشل معالجة الصورة (${r.status})`, detail: await r.text() });

    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/png';
    res.json({ image: `data:${type};base64,${buf.toString('base64')}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// اقتراح منشور كتابي للصورة (Claude مع الرؤية)
app.post('/api/caption', async (req, res) => {
  try {
    if (!need(res, ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY')) return;
    const { image, language = 'ar', tone = 'احترافي وجذاب', topic = '' } = req.body;
    if (!image) return res.status(400).json({ error: 'لم يتم إرسال صورة' });

    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(image);
    if (!m) return res.status(400).json({ error: 'صيغة الصورة غير صحيحة' });

    const langName = { ar: 'العربية', fr: 'الفرنسية', both: 'العربية ثم الفرنسية' }[language] || 'العربية';
    const instruction =
      `انظر إلى الصورة واكتب 3 اقتراحات مختلفة لمنشور على وسائل التواصل الاجتماعي.\n` +
      `اللغة: ${langName}. النبرة: ${tone}. ${topic ? `معلومات إضافية: ${topic}.` : ''}\n` +
      `لكل اقتراح: نص قصير جذاب مع إيموجي مناسبة، ثم 5 إلى 8 هاشتاقات.\n` +
      `أجب بصيغة JSON فقط دون أي نص آخر: {"suggestions":[{"text":"...","hashtags":["#..."]}]}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
              { type: 'text', text: instruction },
            ],
          },
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'فشل توليد النص' });

    const raw = data.content?.map((c) => c.text || '').join('') || '';
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: 'تعذر قراءة رد الذكاء الاصطناعي: ' + e.message });
  }
});

// النشر بلمسة واحدة على المنصات المختارة (Ayrshare)
app.post('/api/publish', async (req, res) => {
  try {
    if (!need(res, AYRSHARE_API_KEY, 'AYRSHARE_API_KEY')) return;
    const { text, image, platforms, scheduleDate } = req.body;
    if (!platforms?.length) return res.status(400).json({ error: 'اختر منصة واحدة على الأقل' });
    if (!image) return res.status(400).json({ error: 'الصورة مطلوبة' });

    // 1) رفع الصورة إلى Ayrshare للحصول على رابط عام
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(image);
    if (!m) return res.status(400).json({ error: 'صيغة الصورة غير صحيحة' });
    const up = await fetch('https://api.ayrshare.com/api/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: image, fileName: 'post.' + m[1].split('/')[1], description: 'post image' }),
    });
    const upData = await up.json();
    if (!up.ok || !upData.url) return res.status(502).json({ error: 'فشل رفع الصورة', detail: upData });

    // 2) النشر
    const body = { post: text || '', platforms, mediaUrls: [upData.url] };
    if (platforms.includes('tiktok')) body.tikTokOptions = { isPhoto: true };
    if (scheduleDate) body.scheduleDate = scheduleDate;

    const r = await fetch('https://api.ayrshare.com/api/post', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : 502).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Venisia Social يعمل على http://localhost:${port}`));
