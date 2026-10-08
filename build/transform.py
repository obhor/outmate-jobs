#!/usr/bin/env python3
"""One-off port: startup.jobs snapshot -> outmate-jobs index.html.

Keeps the chrome (header, hero, filter panel, results shell, role index, footer
brand column) and the Tailwind build verbatim, drops everything bound to the
Rails/Algolia/Stimulus backend, and rebrands. Re-run after editing the SOURCE
snapshot, not after editing index.html.

  python3 build/transform.py ~/ws/startup-jobs/index.html index.html
"""
import re
import sys
from bs4 import BeautifulSoup, Comment

SRC = sys.argv[1] if len(sys.argv) > 1 else "index.html"
DST = sys.argv[2] if len(sys.argv) > 2 else "index.html"
BRAND = "Outmate Jobs"

soup = BeautifulSoup(open(SRC, encoding="utf-8").read(), "lxml")

def drop(el, what):
    assert el is not None, f"missing: {what}"
    el.decompose()

def only(el, what):
    assert el is not None, f"missing: {what}"
    return el

# ---------------------------------------------------------------- head
head = soup.head
for el in list(head.find_all(["script", "noscript"])):
    el.decompose()
for el in list(head.find_all("link")):
    rel = el.get("rel") or []
    keep = "stylesheet" in rel or ("preload" in rel and el.get("as") == "font")
    if not keep:
        el.decompose()
for el in list(head.find_all("meta")):
    # keep charset / viewport / x-ua-compatible / description
    if el.get("charset") or el.get("name") in ("description", "viewport"):
        continue
    el.decompose()
seen_viewport = False
for el in list(head.find_all("meta", attrs={"name": "viewport"})):
    if seen_viewport:
        el.decompose()
    seen_viewport = True
stylesheet = head.find("link", rel="stylesheet")
stylesheet["href"] = "/assets/tailwind.css"
stylesheet.attrs.pop("data-turbo-track", None)
head.append(BeautifulSoup('<link rel="icon" href="/assets/outmate-mark.webp">', "html.parser"))
head.find("title").string = f"{BRAND} – GTM, sales, marketing and customer success jobs"
desc = head.find("meta", attrs={"name": "description"})
desc["content"] = f"{BRAND} indexes go-to-market roles — sales, marketing, customer success and revenue operations — from thousands of live job sources via the JobsPipe API."

# ---------------------------------------------------------------- header
hdr = only(soup.body.find("div", class_="relative"), "header wrapper")
hdr["class"] = ["relative", "bg-white", "dark:bg-gray-900", "z-20", "border-b", "border-gray-100", "dark:border-gray-800"]
bar = only(hdr.find("div", class_=lambda c: c and "justify-between" in c), "header bar")
bar["class"] = ["flex", "justify-between", "items-center", "px-4", "py-6", "sm:px-6"]
for child in list(bar.find_all(recursive=False)):
    child.decompose()
bar.append(BeautifulSoup(f"""
<div class="flex items-center gap-3 shrink-0">
  <img src="/assets/outmate-mark.webp" alt="" class="size-8 sm:h-10 sm:w-10 rounded-sm">
  <span class="text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">{BRAND}</span>
</div>
<nav class="flex items-center gap-1 sm:gap-2">
  <a href="#jobs" class="px-3 py-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white">Browse Jobs</a>
  <a href="#roles" class="px-3 py-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white">Roles</a>
  <a href="https://docs.jobspipe.dev" rel="noopener" class="hidden sm:inline-block px-3 py-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white">Jobs API</a>
</nav>
""", "html.parser"))
for extra in list(hdr.find_all(recursive=False)):
    if extra is not bar:
        extra.decompose()

# ---------------------------------------------------------------- hero
hero = only(soup.find("section", class_=lambda c: c and "z-10" in c), "hero section")
h1 = only(hero.find("h1"), "hero h1")
h1.string = BRAND

# ---------------------------------------------------------------- filter form
form = only(soup.find("form", id="search-form"), "search form")
form["id"] = "filters"
form["action"] = "#jobs"
for k in ("data-action", "method", "accept-charset"):
    form.attrs.pop(k, None)
for el in list(form.find_all("input", type="hidden")):
    el.decompose()
for el in list(form.find_all("select")):
    el.decompose()
for el in list(form.find_all("template")):
    el.decompose()
# placeholder-filled suggestion list under the location input
for el in list(form.find_all("ul", class_=lambda c: c and "absolute" in c)):
    el.decompose()
# "Salary" is a /plus upsell link upstream; "Pimpri" is a hard-coded geo pill;
# both are non-functional here.
for el in list(form.find_all("a", href=re.compile(r"/plus/upsell|latlng=|algolia\.com"))):
    (el.find_parent("details") or el).decompose()
q = only(form.find("input", id="alert_query"), "query input")
q.attrs = {"id": "f-q", "type": "search", "name": "q", "autocomplete": "off",
           "placeholder": "Search GTM roles, skills, or companies…",
           "class": ["px-0", "py-2", "appearance-none", "bg-transparent", "outline-hidden", "w-full"]}
loc = only(form.find("input", id="alert_location_str"), "location input")
loc.attrs = {"id": "f-country", "type": "search", "name": "country", "autocomplete": "off",
             "placeholder": "Country (US, GB, DE…)",
             "class": ["px-0", "py-2", "appearance-none", "bg-transparent", "outline-hidden", "w-full"]}
# native radios/checkboxes already carry peer-checked styling; give them sane names
for el in form.find_all("input", type="checkbox"):
    el.attrs.pop("hidden", None)
    el.attrs.pop("name", None)
    if el["id"].startswith("alert_workplace_type_ids_"):
        el["data-arrangement"] = el["id"].replace("alert_workplace_type_ids_", "").replace("on-site", "onsite")
    else:
        el["data-employment"] = el["id"].replace("alert_employment_type_ids_", "")
for el in form.find_all("input", type="radio"):
    el.attrs.pop("hidden", None)
    if el["id"].startswith("since_"):
        el["data-since"] = el["id"].replace("since_", "")
    else:
        el["data-experience"] = el["id"].replace("experience_bucket_", "")
# upstream defaults to "Anytime"; this board is scoped to a 30-day window
anytime = form.find("input", id="since_anytime")
anytime.attrs.pop("checked", None)
thirty = form.find("input", id="since_30d")
thirty["checked"] = "checked"

# ---------------------------------------------------------------- job listings
HIRING = """
<section class="mt-8" id="hiring">
  <div class="flex flex-wrap gap-x-3 gap-y-1 items-center">
    <h3 class="uppercase font-medium text-sm tracking-wide text-gray-600 dark:text-gray-400">Hiring Now</h3>
    <span class="text-xs text-gray-500 dark:text-gray-400">Companies with the most open go-to-market roles</span>
  </div>
  <div class="mt-2 mb-8 grid grid-cols-2 md:grid-cols-4 gap-3" id="company-list"></div>
</section>
"""
# upstream's static ad slot becomes a live "most open roles" grid fed by
# POST /v1/jobs/companies; same position, same card chrome
spotlight = soup.find("section", id="spotlightStartups")
if spotlight:
    spotlight.replace_with(BeautifulSoup(HIRING, "html.parser").section)
browse = only(soup.find("ul", class_=lambda c: c and "columns" in c), "role index")
roles_section = browse.find_parent("section")
# upstream ships 21 server-rendered cards from its own inventory; ours come from JobsPipe
card_list = soup.find("div", class_="mb-16")
if card_list:
    card_list.decompose()
for br in soup.find_all("br"):
    if br.find_parent("main"):
        br.decompose()
drop(soup.find("div", class_="mt-16"), "newsletter block")
drop(soup.find("div", class_=lambda c: c and "fixed" in c and "bottom-0" in c), "preferences bar")
drop(soup.find("turbo-frame", id="modal"), "modal frame")
drop(soup.find("div", id="tracked_job_toasts"), "toast container")

# role index: upstream links to /roles/<slug>; here each becomes a filter action
for a in browse.find_all("a"):
    role = a.get_text(" ", strip=True)
    a.name = "button"
    a["type"] = "button"
    a["data-role"] = role
    a["class"] = ["hover:underline", "cursor-pointer", "text-left", "block", "w-full"]
    a.attrs.pop("href", None)
roles_section = browse.find_parent("section")
roles_section.attrs["id"] = "roles"

# ---------------------------------------------------------------- results shell
results_section = only(soup.find("section", class_=lambda c: c and "z-0" in c), "results section")
results_section.attrs["id"] = "jobs"
shell = only(results_section.find("div", class_="hidden"), "results shell")
shell["class"] = []
zero = only(shell.find("div", class_="hidden"), "zero state")
zero["id"] = "empty-state"
loading = only(shell.find("div", class_=lambda c: c and "py-12" in c), "loading state")
loading["id"] = "loading-state"
drop(shell.find("div", class_=lambda c: c and "mb-6" in c), "companies label")
listbox = only(shell.find("div", class_=lambda c: c and "divide-y" in c), "results list")
listbox["id"] = "job-list"
listbox.insert_before(BeautifulSoup('<div class="hidden px-3 py-2 text-sm text-gray-500 dark:text-gray-400" id="company-filter"></div>', "html.parser"))
showmore = only(shell.find("a", class_=lambda c: c and "text-center" in c), "show more")
showmore.name = "button"
showmore["type"] = "button"
showmore["id"] = "show-more"
showmore["class"] = ["hidden", "block", "w-full", "p-4", "text-center", "rounded-sm",
                     "bg-gray-100", "dark:bg-gray-800", "hover:bg-gray-200", "dark:hover:bg-gray-700",
                     "cursor-pointer", "font-medium"]
showmore.string = "Show more results"
shell.append(BeautifulSoup('<p id="result-count" class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400"></p>', "html.parser"))

# upstream put its default postings above the role index and its (hidden) search
# -results shell below it; we render live jobs into that shell, so the index has
# to move down or the postings end up under it
results_section.insert_after(roles_section)

# ---------------------------------------------------------------- footer
footer = only(soup.find("footer"), "footer")
cols = only(footer.find("section"), "footer columns")
kept = only(cols.find("div", class_=lambda c: c and "col-span-2" in c), "footer brand column")
for c in list(cols.find_all(recursive=False)):
    if c is not kept:
        c.decompose()
cols["class"] = ["container", "mx-auto", "grid", "grid-cols-1", "gap-8"]
for el in kept.find_all("img"):
    el["src"] = "/assets/outmate-mark.webp"
    el["alt"] = BRAND
for el in kept.find_all(string=re.compile("Startup Jobs|All startup jobs|2016-2026")):
    el.replace_with(
        el.replace("Startup Jobs", BRAND)
        .replace("All startup jobs in one place.", "Go-to-market roles, in one place.")
        .replace("2016-2026", "2026")
    )

# ---------------------------------------------------------------- tracking junk
for sel in ("iframe", "noscript"):
    for el in list(soup.find_all(sel)):
        el.decompose()
for el in list(soup.find_all("script")):
    el.decompose()
for el in list(soup.find_all(string=lambda t: isinstance(t, Comment))):
    el.extract()
drop(form.find("div", class_="ml-auto"), "empty trailing div")
for img in list(soup.find_all("img")):
    if re.search(r"ads\.|analytics\.|static\.ads|t\.co/|linkedin\.com/collect", str(img.get("src", ""))):
        img.decompose()

# ---------------------------------------------------------------- app
soup.body.append(BeautifulSoup('<script type="module" src="/assets/app.js"></script>', "html.parser"))

out = soup.prettify()
out = out.replace("<!DOCTYPE html>", "<!doctype html>\n<!-- Ported from startup.jobs. Chrome + stylesheet are theirs; job data is JobsPipe. -->")
open(DST, "w", encoding="utf-8").write(out)
print(f"wrote {DST}: {len(out)} bytes")
