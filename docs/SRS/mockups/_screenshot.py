import os
from playwright.sync_api import sync_playwright

base = os.path.dirname(os.path.abspath(__file__))
files = [
    ("02-discussion-import.html", "02-discussion-import.png"),
    ("03-candidate-review.html", "03-candidate-review.png"),
    ("04-decision-edit.html", "04-decision-edit.png"),
    ("05-graph-view.html", "05-graph-view.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    for html, png in files:
        url = "file:///" + os.path.join(base, html).replace("\\", "/")
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(base, png), full_page=True)
        print("saved", png)
    browser.close()
