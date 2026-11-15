import pathlib
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).resolve().parent
out = here / "png"; out.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1100, "height": 900})
    pg.goto((here / "stickers.html").as_uri()); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(1200)
    names = pg.evaluate("window.STICKERS")
    for n in names:
        pg.locator(f"#{n}").screenshot(path=str(out / f"deepblue-{n}.png"), omit_background=True)
    b.close()
print(len(names), "stickers")
