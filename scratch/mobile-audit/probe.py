"""Quick probe to check login works."""
import os, sys, time
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width":390,"height":844},
        is_mobile=True, has_touch=True, device_scale_factor=2,
    )
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append((m.type, m.text)) if m.type in ("error","warning") else None)
    page.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
    print("Login page loaded. URL:", page.url)
    page.screenshot(path="D:/OPEN APPS/DigitalOcian Projects/El Hoot/scratch/mobile-audit/_login.png", full_page=True)

    page.fill('input[type="text"]', "admin")
    page.fill('input[type="password"]', "123456")
    page.click('button[type="submit"]')

    end = time.time() + 25
    while time.time() < end and "/login" in page.url:
        page.wait_for_timeout(500)
    print("After submit URL:", page.url)
    page.wait_for_timeout(2000)
    print("After 2s URL:", page.url)
    page.screenshot(path="D:/OPEN APPS/DigitalOcian Projects/El Hoot/scratch/mobile-audit/_after_login.png", full_page=True)
    body = (page.text_content("body") or "")[:300]
    print("Body excerpt:", body)
    print("Errors:", errs[:10])
    browser.close()
