"""
Mobile responsiveness audit for El Hoot (localhost:3000).
Loads each page on iPhone 13 Pro (390x844) and Pixel 5 (393x851),
captures full-page screenshots, and reports:
  - horizontal overflow
  - tap targets < 40px tall
  - small text (< 12px)
  - console errors
"""
import json
import os
import sys
import time
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from pathlib import Path
from playwright.sync_api import sync_playwright

import os
BASE = os.environ.get("AUDIT_BASE", "https://elhoot.openappo.com")
OUT = Path(__file__).parent
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("01_login",              "/login",                            False),
    ("02_dashboard",          "/dashboard",                        True),
    ("03_sales",              "/sales",                            True),
    ("04_sales_new",          "/sales/new",                        True),
    ("05_purchases",          "/purchases",                        True),
    ("06_purchases_new",      "/purchases/new",                    True),
    ("07_customers",          "/customers",                        True),
    ("08_suppliers",          "/suppliers",                        True),
    ("09_products",           "/products",                         True),
    ("10_inventory",          "/inventory",                        True),
    ("11_inventory_transfers","/inventory/transfers",              True),
    ("12_treasury",           "/treasury",                         True),
    ("13_treasury_cust_pay",  "/treasury/customer-payments",       True),
    ("14_treasury_supp_pay",  "/treasury/supplier-payments",       True),
    ("15_collections",        "/collections",                      True),
    ("16_my_inventory",       "/my-inventory",                     True),
    ("17_my_sales",           "/my-sales",                         True),
    ("18_route",              "/route",                            True),
    ("19_returns_customer",   "/returns/customer",                 True),
    ("20_returns_supplier",   "/returns/supplier",                 True),
    ("21_expenses",           "/expenses",                         True),
    ("22_reports",            "/reports",                          True),
    ("23_reports_pl",         "/reports/profit-loss",              True),
    ("24_reports_statements", "/reports/statements",               True),
    ("25_profile",            "/profile",                          True),
    ("26_admin_users",        "/admin/users",                      True),
    ("27_admin_stores",       "/admin/stores",                     True),
    ("28_admin_routes",       "/admin/routes",                     True),
]

VIEWPORTS = [
    ("iphone13", 390, 844),
    ("pixel5",   393, 851),
]

def login(page):
    """Performs a fresh login, waits until away from /login."""
    page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
    page.fill('input[type="text"]', "openapps")
    page.fill('input[type="password"]', "123456")
    page.click('button[type="submit"]')
    end = time.time() + 20
    while time.time() < end and "/login" in page.url:
        page.wait_for_timeout(400)
    if "/login" in page.url:
        # The login might have been rejected
        body_text = page.text_content("body") or ""
        raise RuntimeError(f"login did not redirect; body excerpt: {body_text[:200]!r}")
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass

def collect_issues(page):
    issues = []
    metrics = page.evaluate("""() => {
        const body = document.body;
        const html = document.documentElement;
        return {
            scrollW: Math.max(body.scrollWidth, html.scrollWidth),
            clientW: html.clientWidth,
            scrollH: Math.max(body.scrollHeight, html.scrollHeight),
            vh: window.innerHeight,
            vw: window.innerWidth,
        };
    }""")
    if metrics["scrollW"] > metrics["clientW"] + 2:
        issues.append({
            "type": "horizontal_overflow",
            "msg": f"scroll عرضي: scrollWidth={metrics['scrollW']}px > clientWidth={metrics['clientW']}px "
                   f"(+{metrics['scrollW']-metrics['clientW']}px خارج الشاشة)",
        })

    small_targets = page.evaluate("""() => {
        const sels = ['button','a','input','select','[role=button]'];
        const results = [];
        sels.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                if (r.bottom < 0 || r.top > window.innerHeight + 5000) return;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none') return;
                if (r.height < 40 || r.width < 40) {
                    const text = (el.innerText || el.value || el.placeholder || el.ariaLabel || el.title || el.getAttribute('aria-label') || '').trim().slice(0, 50);
                    results.push({
                        tag: el.tagName.toLowerCase(),
                        text,
                        w: Math.round(r.width),
                        h: Math.round(r.height),
                    });
                }
            });
        });
        return results;
    }""")
    for t in small_targets:
        issues.append({
            "type": "small_tap_target",
            "msg": f"<{t['tag']}> نص='{t['text']}' {t['w']}x{t['h']}px — أقل من 44px الموصى بها",
        })

    small_text = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('p, span, div, li, td, th, label, h1, h2, h3, h4, h5, h6, a').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            if (getComputedStyle(el).visibility === 'hidden') return;
            const cs = getComputedStyle(el);
            const fs = parseFloat(cs.fontSize);
            if (!isFinite(fs) || fs >= 12) return;
            if (el.children.length > 0) return;
            const text = (el.innerText || '').trim();
            if (!text) return;
            out.push({ text: text.slice(0, 50), fs: Math.round(fs*10)/10 });
        });
        return out;
    }""")
    seen = set()
    for t in small_text:
        key = t["text"]
        if key in seen:
            continue
        seen.add(key)
        issues.append({
            "type": "small_text",
            "msg": f"نص صغير {t['fs']}px: '{t['text']}'",
        })

    return issues, metrics

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        results = {}
        for vname, vw, vh in VIEWPORTS:
            print(f"\n========== Viewport: {vname} ({vw}x{vh}) ==========", flush=True)
            ctx = browser.new_context(
                viewport={"width": vw, "height": vh},
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
                user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            )
            page = ctx.new_page()
            console_errors = []
            page.on("console", lambda msg: console_errors.append({"type": msg.type, "text": msg.text}) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: console_errors.append({"type": "pageerror", "text": str(exc)}))

            try:
                login(page)
            except Exception as e:
                print(f"  ! login failed: {e}", flush=True)
                ctx.close()
                continue

            for label, path, requires_login in PAGES:
                if requires_login and "/login" in page.url:
                    try:
                        login(page)
                    except Exception as e:
                        print(f"  {label}: re-login failed: {e}", flush=True)
                        continue

                try:
                    resp = page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=30000)
                except Exception as e:
                    print(f"  {label}: FAIL navigation: {e}", flush=True)
                    continue
                try:
                    page.wait_for_load_state("networkidle", timeout=20000)
                except Exception:
                    pass
                page.wait_for_timeout(1200)

                # If we got redirected to /login (session expired) - try login once
                if requires_login and "/login" in page.url and label != "01_login":
                    try:
                        login(page)
                        resp = page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=30000)
                        page.wait_for_load_state("networkidle", timeout=20000)
                        page.wait_for_timeout(1200)
                    except Exception as e:
                        print(f"  {label}: re-auth & retry failed: {e}", flush=True)
                        continue

                status = resp.status if resp else "??"
                shot_path = OUT / f"{label}_{vname}.png"
                try:
                    page.screenshot(path=str(shot_path), full_page=True)
                except Exception as e:
                    print(f"  {label}: screenshot failed: {e}", flush=True)
                    shot_path = None

                issues, m = collect_issues(page)
                page_console = list(console_errors)
                console_errors.clear()

                key = f"{label}@{vname}"
                results[key] = {
                    "label": label, "path": path,
                    "viewport": f"{vw}x{vh}", "status": status,
                    "metrics": m, "issues": issues,
                    "console_errors": page_console,
                    "screenshot": str(shot_path) if shot_path else None,
                }
                marker = "OK" if not issues else f"{len(issues)} issue(s)"
                final_url = page.url
                print(f"  {label} [{status}] {marker}  url={final_url}", flush=True)

            ctx.close()
        browser.close()

        with open(OUT / "report.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\n[OK] Saved report -> {OUT/'report.json'}")

if __name__ == "__main__":
    main()
