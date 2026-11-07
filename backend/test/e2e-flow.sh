#!/usr/bin/env bash
# E2E دستی: جریان کامل بات از «سؤال مبهم» تا «پاسخ فروشنده» — با سرور جعلی تلگرام.
# پیش‌نیاز:
#   1) Postgres روی 5433 (cd /home/user/pgtest && node boot.mjs)
#   2) node /tmp/fakebot4.mjs   (سرور جعلی تلگرام روی 4599، لاگ در /tmp/bot4.jsonl)
#   3) npm run build در backend و اجرای dist/main.js با:
#      TELEGRAM_API_BASE=http://127.0.0.1:4599 TELEGRAM_WEBHOOK_SECRET=e2e-webhook-secret-123456
#      PUBLIC_API_URL=http://127.0.0.1:10000 CACHE_ENABLED=false PORT=10000
# سپس: bash backend/test/e2e-flow.sh
set -e
API=http://127.0.0.1:10000
SECRET=e2e-webhook-secret-123456
say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
EMAIL="e2e2-$(date +%s%N)@example.com"
U=$(( RANDOM * 1000 + 10 ))
OWNER_CHAT=$(( 7000000 + RANDOM ))
CUST=$(( 5000000 + RANDOM ))
hook() { curl -s -X POST "$API/telegram/webhook/$SECRET" -H "x-telegram-bot-api-secret-token: $SECRET" -H 'content-type: application/json' -d "$1"; echo; }
msg() { U=$((U+1)); local b; b=$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$2"); hook "{\"update_id\":$U,\"message\":{\"message_id\":$U,\"date\":1,\"text\":$b,\"chat\":{\"id\":$1,\"type\":\"private\",\"first_name\":\"سارا\"},\"from\":{\"id\":$1,\"is_bot\":false,\"first_name\":\"سارا\"}}}"; }
cb() { U=$((U+1)); hook "{\"update_id\":$U,\"callback_query\":{\"id\":\"cb$U\",\"from\":{\"id\":$1,\"is_bot\":false},\"data\":\"$2\",\"message\":{\"message_id\":1,\"chat\":{\"id\":$1,\"type\":\"private\"}}}}"; }

say "۱) فروشگاه و دو محصول"
TOKEN=$(curl -s -X POST $API/auth/register -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd!123\",\"shopName\":\"بوتیک تست\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
AUTH="authorization: Bearer $TOKEN"
PID1=$(curl -s -X POST $API/products -H "$AUTH" -H 'content-type: application/json' -d '{"title":"مانتو کتان","category":"مانتو"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
VID1=$(curl -s -X POST $API/products/$PID1/variants -H "$AUTH" -H 'content-type: application/json' -d '{"size":"۳۸","color":"کرم","price":640000,"stock":3}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
PID2=$(curl -s -X POST $API/products -H "$AUTH" -H 'content-type: application/json' -d '{"title":"مانتو ابریشمی","category":"مانتو"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST $API/products/$PID2/variants -H "$AUTH" -H 'content-type: application/json' -d '{"size":"۴۰","color":"مشکی","price":1200000,"stock":1}' >/dev/null
CODE=$(curl -s -X POST $API/channel/telegram/connect -H "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["code"])')
OWNER=$(curl -s -X POST $API/channel/telegram/owner-code -H "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["ownerCode"])')
echo "  آماده"

say "۲) فروشنده وصل می‌شود، مشتری وارد می‌شود، سؤال مبهم می‌پرسد"
msg $OWNER_CHAT "/link $OWNER" > /dev/null
echo "  فروشنده: $OWNER_CHAT · مشتری: $CUST"
msg $CUST "/start $CODE" > /dev/null
msg $CUST "این مانتو چنده؟"

say "۳) چیدمان محصولات (باید ستونی باشد)"
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if 'بیش از یک محصول' in (s.get('text') or '')][-1]
rows=m['reply_markup']['inline_keyboard']
print(f"  تعداد ردیف دکمه: {len(rows)} · دکمه در هر ردیف: {[len(r) for r in rows]}  ← ستونی یعنی همه ۱")
for r in rows: print("   [", r[0]['text'], "]")
print("  --- متن پیام ---")
for line in m['text'].split('\n'): print("  ", line)
PY

say "۴) انتخاب محصول، شروع سفارش، تعداد، نام، موبایل"
cb $CUST "p:$PID1" > /dev/null
cb $CUST "ord:$VID1" > /dev/null
cb $CUST "flow:q:2" > /dev/null
msg $CUST "سارا محمدی" > /dev/null
msg $CUST "۰۹۱۲۳۴۵۶۷۸۹" > /dev/null

say "۵) لیست استان‌ها"
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if (s.get('text') or '').startswith('<i>مرحله ۴ از ۱۱')][-1]
print("  متن:", m['text'].replace('\n',' | ')[:110])
rows=m['reply_markup']['inline_keyboard']
print(f"  {len(rows)} ردیف · نمونه: {[r[0]['text'] for r in rows[:4]]} … {[r[0].get('text') for r in rows[-2:]]}")
PY

say "۶) انتخاب تهران → لیست شهرها"
cb $CUST "flow:prov:تهران" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if 'شهر در استان' in (s.get('text') or '')][-1]
print("  متن:", m['text'].replace('\n',' | ')[:100])
rows=m['reply_markup']['inline_keyboard']
print(f"  {len(rows)} ردیف · شهرها: {[r[0]['text'] for r in rows[:5]]}")
PY

say "۷) صفحه‌ی دوم استان‌ها (برگشت و صفحه‌بندی)"
cb $CUST "flow:back" > /dev/null
cb $CUST "flow:provpage:1" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if 'صفحه ۲ از ۴' in (s.get('text') or '')][-1]
print(" ", m['text'].split('\n')[3:5], "· نمونه:", [r[0]['text'] for r in m['reply_markup']['inline_keyboard'][:3]])
PY
cb $CUST "flow:prov:تهران" > /dev/null
cb $CUST "flow:city:تهران" > /dev/null

say "۸) خیابان → کوچه (دکمه ندارد) → پلاک → واحد → کد پستی (رد)"
msg $CUST "خیابان ولیعصر" > /dev/null
cb $CUST "flow:alley:none" > /dev/null
msg $CUST "۱۲" > /dev/null
msg $CUST "۳" > /dev/null
cb $CUST "flow:postal:skip" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if 'پیش‌فاکتور' in (s.get('text') or '')][-1]
for line in m['text'].split('\n'): print("  ", line)
PY

say "۹) تأیید → سفارش و لینک پرداخت"
cb $CUST "flow:confirm" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if 'سفارش شما ساخته شد' in (s.get('text') or '')][-1]
for line in m['text'].split('\n'): print("  ", line)
btn=m['reply_markup']['inline_keyboard'][0][0]
print("   [", btn['text'], "→", btn['url'][:60], "]")
PY

say "۱۰) نشانی ساختیافته در پنل"
CUST="$CUST" OWNER_CHAT="$OWNER_CHAT" TOKEN="$TOKEN" python3 - <<'PY'
import json, os, urllib.request
req = urllib.request.Request("http://127.0.0.1:10000/orders", headers={"authorization": "Bearer " + os.environ["TOKEN"]})
o = json.load(urllib.request.urlopen(req))[0]
print(f"  {o['code']} · {o['status']} · {o['total']} تومان")
for k in ('province','city','street','alley','plaque','unit','postalCode'):
    print(f"    {k:10s} = {o[k]!r}")
print(f"    address    = {o['address']}")
PY

say "۱۱) ارجاع به انسان → اعلان با کد گفتگو و force_reply"
msg $CUST "می‌خوام مرجوع کنم" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json, os
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if s.get('chat_id')==os.environ['OWNER_CHAT']][-1]
for line in m['text'].split('\n'): print("  ", line)
print("   force_reply:", m['reply_markup'].get('force_reply'))
code=[l for l in m['text'].split('\n') if '#گفتگو' in l][0].split()[-1]
open('/tmp/code.txt','w').write(code)
PY

say "۱۲) فروشنده با /reply پاسخ می‌دهد"
CODE=$(cat /tmp/code.txt)
msg $OWNER_CHAT "/reply $CODE بله تا فردا ارسال می‌شه" > /dev/null
OWNER_CHAT="$OWNER_CHAT" CUST="$CUST" python3 - <<'PY'
import json, os
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
m=[s for s in sends if s.get('chat_id')==os.environ['CUST']][-1]
print("  مشتری دریافت کرد:")
for line in m['text'].split('\n'): print("  ", line)
PY

say "۱۳) پاسخ از پنل + تاریخچه"
OID=$(curl -s $API/orders -H "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
curl -s -X POST $API/orders/$OID/message -H "$AUTH" -H 'content-type: application/json' -d '{"text":"سلام سارا جان، سفارشتون ثبت شد و فردا می‌رسه 🌷"}' > /dev/null
OID="$OID" CUST="$CUST" OWNER_CHAT="$OWNER_CHAT" TOKEN="$TOKEN" python3 - <<'PY'
import json, os, urllib.request
OID = os.environ["OID"]
tok = "Bearer " + os.environ["TOKEN"]
req = urllib.request.Request(f"http://127.0.0.1:10000/orders/{OID}/messages", headers={"authorization": tok})
for m in json.load(urllib.request.urlopen(req)):
    print(f"   [{m['direction']:3s}] {m['text'][:60]}")
PY

say "۱۴) پیام پنل به تلگرام مشتری رسید؟"
CUST="$CUST" python3 - <<'PY'
import json
sends=[json.loads(l) for l in open('/tmp/bot4.jsonl')]
import os
m=[s for s in sends if 'سارا جان' in (s.get('text') or '') and s.get('chat_id')==os.environ['CUST']][-1]
print("  ", m['text'].replace('\n',' / '), "· chat:", m['chat_id'])
PY
