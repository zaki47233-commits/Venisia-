# Venisia Social

نشر بلمسة واحدة على تيكتوك وإنستغرام وفيسبوك، مع تحسين الصور وتغيير الخلفية واقتراح المنشورات.

## التشغيل
1. ثبّت Node.js (الإصدار 18 أو أحدث).
2. انسخ `.env.example` إلى `.env` واملأ المفاتيح:
   - `AYRSHARE_API_KEY` من ayrshare.com، ثم اربط حسابات تيكتوك وإنستغرام وفيسبوك من لوحة Ayrshare.
   - `ANTHROPIC_API_KEY` من console.anthropic.com.
   - `PHOTOROOM_API_KEY` من photoroom.com/api.
3. نفّذ:
   ```
   npm install
   npm start
   ```
4. افتح http://localhost:3000

## ملاحظات
- ربط الحسابات يتم داخل لوحة Ayrshare (مرة واحدة)، وهي من تتولى موافقات المنصات.
- إنستغرام يتطلب حساب Business أو Creator مرتبطاً بصفحة فيسبوك.
- فيسبوك: النشر على الصفحات فقط.
- لنشره على الإنترنت استخدم Render أو Railway أو Fly.io، وأضف المفاتيح كمتغيرات بيئة.
