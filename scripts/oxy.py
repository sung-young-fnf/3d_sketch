"""
Oxylabs 레지덴셜 프록시를 거쳐 archisketch API 를 부르는 공통 헬퍼.

- 출구는 한국(cc-KR)으로 고정한다. 같은 계정이 요청마다 다른 나라 IP 로 찍히면
  이상 로그인으로 걸리기 쉽다.
- 세션 고정(sessid, 30분)으로 로그인과 이후 호출이 같은 IP 에서 나가게 한다.
  토큰 하나로 IP 가 계속 바뀌는 것 자체가 이상 신호다.
- 자격증명은 실행 시 Shop-vmd-blender/.env 에서 읽는다. 코드·로그에 남기지 않는다.

사용:
    from oxy import Client
    c = Client()            # 프록시 + 로그인
    c.ip()                  # 현재 출구 IP 확인
    c.get("/project/api/v1/projects?...")
    c.download(url, dest)   # CDN 파일도 같은 출구로
"""

import json
import os
import random
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(os.path.dirname(ROOT), ".env")
API = "https://api.archisketch.com"
ORIGIN = "https://fnf.archisketch.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/141.0 Safari/537.36")


def _env():
    vals = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().lstrip(":").strip()
    return vals


class Client:
    def __init__(self, country="KR", session_minutes=30, login=True):
        env = _env()
        user, pw = env["OXYLABS_USERNAME"], env["OXYLABS_PASSWORD"]
        self.session_id = f"{random.randrange(10**9):09d}"
        proxy_user = f"{user}-cc-{country}-sessid-{self.session_id}-sesstime-{session_minutes}"
        proxy = f"http://{proxy_user}:{pw}@pr.oxylabs.io:7777"
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        self.token = None
        self._email = env.get("admin_id")
        self._password = env.get("admin_password")
        if login:
            self.login()

    # ---------------------------------------------------------------- 저수준
    def _open(self, req, timeout=60):
        return self.opener.open(req, timeout=timeout)

    def ip(self):
        req = urllib.request.Request("https://ip.oxylabs.io/location", headers={"User-Agent": UA})
        with self._open(req, 30) as r:
            d = json.loads(r.read().decode("utf-8"))
        p = d["providers"]["dbip"]
        return {"ip": d["ip"], "country": p["country"], "org": p["org_name"]}

    def login(self):
        body = json.dumps({"email": self._email, "password": self._password}).encode()
        req = urllib.request.Request(API + "/login", data=body, headers={
            "Content-Type": "application/json", "Origin": ORIGIN, "User-Agent": UA})
        with self._open(req) as r:
            self.token = json.loads(r.read().decode("utf-8"))["token"]
        return self.token

    def get(self, path, tries=5):
        for a in range(tries):
            req = urllib.request.Request(API + path, headers={
                "Authorization": "Bearer " + self.token, "Origin": ORIGIN, "User-Agent": UA})
            try:
                with self._open(req) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (429, 502, 503):
                    time.sleep(2 ** a + random.random())
                    continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if a == tries - 1:
                    raise
                time.sleep(2 ** a)
        raise RuntimeError("retries exhausted: " + path)

    def download(self, url, dest, timeout=180):
        """CDN 파일 받기. 이미 있으면 건너뛴다. 결과: ('ok'|'skip'|'httpNNN'|'error', bytes)"""
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return "skip", os.path.getsize(dest)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".part"
        for a in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with self._open(req, timeout) as r, open(tmp, "wb") as f:
                    while True:
                        chunk = r.read(1 << 16)
                        if not chunk:
                            break
                        f.write(chunk)
                os.replace(tmp, dest)
                return "ok", os.path.getsize(dest)
            except urllib.error.HTTPError as e:
                if os.path.exists(tmp):
                    os.remove(tmp)
                return f"http{e.code}", 0
            except Exception:  # noqa: BLE001
                if os.path.exists(tmp):
                    os.remove(tmp)
                if a == 2:
                    return "error", 0
                time.sleep(2 ** a)
        return "error", 0
