#!/usr/bin/env python3
"""Screenshot a local page and dump console errors. python3 build/shot.py <url> <out.png> [width] [height]"""
import base64, json, subprocess, sys, time, urllib.request, websocket

URL, OUT = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1600
PORT = 9444

chrome = subprocess.Popen([
    "chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    f"--window-size={W},{H}", f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
    "--user-data-dir=/tmp/shot-profile", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def ws_url():
    for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list")):
        if t["type"] == "page":
            return t["webSocketDebuggerUrl"]

u = None
for _ in range(40):
    try:
        u = ws_url()
        if u:
            break
    except Exception:
        pass
    time.sleep(0.5)
assert u, "no page target"

ws = websocket.create_connection(u, timeout=60)
_id = 0
logs = []

def send(method, params=None):
    global _id
    _id += 1
    ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
    return _id

def wait(mid):
    while True:
        m = json.loads(ws.recv())
        if m.get("method") == "Runtime.consoleAPICalled" and m["params"]["type"] in ("error", "warning"):
            logs.append("console." + m["params"]["type"] + ": " + " ".join(str(a.get("value")) for a in m["params"]["args"]))
        if m.get("method") == "Runtime.exceptionThrown":
            logs.append("exception: " + m["params"]["exceptionDetails"].get("text", "") + " " +
                        str(m["params"]["exceptionDetails"].get("exception", {}).get("description", ""))[:200])
        if m.get("id") == mid:
            return m.get("result", {})

wait(send("Runtime.enable"))
wait(send("Page.enable"))
wait(send("Log.enable"))
wait(send("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False}))
navigate = send("Page.navigate", {"url": URL})
wait(navigate)
time.sleep(6)

info = wait(send("Runtime.evaluate", {"expression": """JSON.stringify({
  title: document.title,
  rows: document.querySelectorAll('#job-list > div').length,
  count: document.getElementById('result-count')?.textContent,
  empty: !document.getElementById('empty-state')?.classList.contains('hidden'),
  more: !document.getElementById('show-more')?.classList.contains('hidden'),
  firstTitle: document.querySelector('#job-list a div')?.textContent,
  font: getComputedStyle(document.body).fontFamily,
  imgOk: [...document.images].filter(i => i.naturalWidth === 0 && i.clientWidth > 0).length,
})""", "returnByValue": True}))
print(info.get("result", {}).get("value"))
shot = wait(send("Page.captureScreenshot", {"captureBeyondViewport": True, "format": "png"}))
open(OUT, "wb").write(base64.b64decode(shot["data"]))
print("shot:", OUT)
print("logs:", logs or "none")
ws.close()
chrome.terminate()
