#!/bin/sh
# Tells the search engines that share IndexNow (Bing, DuckDuckGo through Bing, Yandex, Seznam, Naver) which pages
# are new or changed, right after a deploy (auto-update.sh calls it). Google does not take part: it reads the sitemap.
# Only what changed since the last send is sent: a page that is new in the sitemap, or whose <lastmod> moved. The
# first run sends them all. The key is the name of the file src/public/<key>.txt, which the site serves at its root
# (that is how the engines check the sender owns the site): it is public by design, not a secret.
set -eu
cd "$(dirname "$0")/.."
domain="$(sed -n 's/^APP_DOMAIN=//p' .env)"
key="$(ls src/public | sed -n 's/^\([0-9a-f]\{32\}\)\.txt$/\1/p' | head -1)"
[ -n "$domain" ] && [ -n "$key" ] || { echo "IndexNow: no domain or no key, nothing sent"; exit 0; }
sent="$HOME/.hok-indexnow-sent" # one line per page already sent: "<address> <lastmod>"
curl -fsS "https://$domain/sitemap.xml" | python3 -c '
import json, re, sys, os, urllib.request
domain, key, sent_path = sys.argv[1:4]
xml = sys.stdin.read()
pages = [(m.group(1), m.group(2) or "") for m in re.finditer(r"<url><loc>([^<]+)</loc>(?:<lastmod>([^<]+)</lastmod>)?", xml)]
now = {f"{url} {day}" for url, day in pages}
before = set(open(sent_path).read().split("\n")) if os.path.exists(sent_path) else set()
changed = [url for url, day in pages if f"{url} {day}" not in before]
if not changed:
    print("IndexNow: nothing new or changed")
    sys.exit(0)
for start in range(0, len(changed), 10000):
    body = json.dumps({"host": domain, "key": key, "keyLocation": f"https://{domain}/{key}.txt", "urlList": changed[start:start + 10000]}).encode()
    request = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(request, timeout=30) as answer:
        print(f"IndexNow: {len(changed[start:start + 10000])} pages sent, answer {answer.status}")
open(sent_path, "w").write("\n".join(sorted(now)))
' "$domain" "$key" "$sent"
