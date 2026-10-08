// Outmate Jobs client. Reads the native filter controls the ported markup already
// carries, asks /api/jobs (which holds the JobsPipe key), renders the rows.

const EXPERIENCE = { "0-1": ["entry_level"], "1-3": ["mid_level"], "3-6": ["senior"], "6+": ["director", "executive"] };
// upstream checkbox ids are snake_case; JobsPipe expects hyphenated employment types
const EMPLOYMENT = { full_time: "full-time", part_time: "part-time", contractor: "contract", internship: "internship" };
const DAYS = { "24h": "1", "7d": "7", "30d": "30", anytime: "anytime" };

export function buildParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set("job_title_or", f.q);
  if (f.role) p.set("job_title_or", f.role);
  for (const a of f.arrangements || []) p.append("work_arrangement_or", a);
  for (const e of f.employment || []) p.append("employment_type_or", EMPLOYMENT[e] || e);
  for (const s of f.seniority || []) p.append("job_seniority_or", s);
  if (f.country) p.set("job_country_code_or", f.country);
  if (f.company) p.set("company_name_or", f.company);
  p.set("posted_at_max_age_days", DAYS[f.since] ?? "30");
  if (f.cursor) p.set("cursor", f.cursor);
  return p;
}

export function readFilters(form, role) {
  const val = (sel) => form.querySelector(sel)?.value?.trim() ?? "";
  const checked = (attr) => [...form.querySelectorAll(`[data-${attr}]:checked`)].map((el) => el.dataset[attr]);
  const experience = form.querySelector("[data-experience]:checked")?.dataset.experience;
  return {
    q: val("#f-q"),
    country: val("#f-country").slice(0, 2).toUpperCase(),
    role: role || "",
    arrangements: checked("arrangement"),
    employment: checked("employment"),
    seniority: experience ? EXPERIENCE[experience] || [] : [],
    since: form.querySelector("[data-since]:checked")?.dataset.since || "30d",
  };
}

// upstream flagged same-day postings with a green "New" badge; a 24h window is
// close enough and immune to the viewer's timezone
export const isFresh = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < 864e5;
};

export function relativeTime(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} minutes ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  const days = Math.round(mins / 1440);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function row(job) {
  const tile = job.logo
    ? `<img src="${esc(job.logo)}" loading="lazy" alt="" class="size-full object-contain object-center">`
    : `<span class="size-full flex items-center justify-center text-base font-semibold text-gray-500" style="background:hsl(${hue(job.company)} 55% 92%)">${esc((job.company || "?").trim()[0])}</span>`;
  const pill = (label, icon) => `<a class="text-xs text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 font-medium uppercase tracking-wide flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 border border-gray-950/10 dark:border-white/10" href="#jobs" data-pill="${label.toLowerCase()}"><svg class="size-3" aria-hidden="true" data-slot="icon"><use href="#icon-micro-${icon}"></use></svg>${label}</a>`;
  const place = job.location || "";
  const fresh = isFresh(job.posted)
    ? `<span class="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/50 font-medium uppercase tracking-wide rounded-full px-2 py-0.5 ring-1 ring-green-600/20 dark:ring-green-400/30 ring-inset">New</span>`
    : "";
  return `<div class="isolate group/post grid grid-cols-9 relative gap-2 p-3 items-center w-full hover:bg-gray-50 dark:hover:bg-gray-800/50">
  <div class="col-span-8 flex sm:items-center gap-3">
    <div class="relative block shrink-0 size-10 overflow-hidden bg-white dark:bg-gray-100 rounded-sm">
      ${tile}
      <div class="absolute inset-0 rounded-sm ring-1 ring-inset ring-black/10 dark:ring-white/10"></div>
    </div>
    <div class="grow overflow-hidden">
      <div class="flex flex-col justify-center">
        <a target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 font-medium sm:text-lg leading-tight hover:underline" href="${esc(job.url)}">
          <div class="sm:truncate">${esc(job.title)}</div>
        </a>
        <div class="flex flex-row items-center flex-wrap sm:flex-nowrap gap-x-1 text-sm">
          <span class="z-10 text-gray-700 dark:text-gray-300">${esc(job.company)}</span>
          <span class="text-gray-400 dark:text-gray-500">&middot;</span>
          <div class="z-10 text-gray-500 dark:text-gray-400">${esc(place)}</div>
          <div class="z-10">${job.remote ? pill("Remote", "wifi") : job.arrangement === "hybrid" ? pill("Hybrid", "home") : ""}</div>
          <span class="text-gray-400 dark:text-gray-500">&middot;</span>
          <time datetime="${esc(job.posted)}" class="text-gray-500 dark:text-gray-400">${esc(relativeTime(job.posted))}</time>
          ${fresh}
        </div>
      </div>
    </div>
  </div>
  <div class="col-span-1 flex items-center justify-end gap-2">
    <a class="hidden md:block z-10 border border-gray-950/10 dark:border-white/10 bg-white dark:bg-gray-800 hover:border-gray-950/20 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white text-gray-600 dark:text-gray-300 font-medium rounded-sm px-3 py-1" rel="nofollow noopener" target="_blank" href="${esc(job.url)}">Apply</a>
  </div>
</div>`;
}

function companyTile(c) {
  const name = c.name || "";
  const tile = c.logo
    ? `<img src="${esc(c.logo)}" loading="lazy" alt="" class="size-full object-contain object-center">`
    : `<span class="size-full flex items-center justify-center text-base font-semibold text-gray-500" style="background:hsl(${hue(name)} 55% 92%)">${esc(name.trim()[0] || "?")}</span>`;
  const meta = [c.employee_count ? `${c.employee_count.toLocaleString()} employees` : "", c.hq_city || c.hq_country || ""].filter(Boolean).join(" · ");
  return `<button type="button" data-company="${esc(name)}" class="rounded-md p-3 border border-black/10 dark:border-white/10 hover:shadow-lg hover:border-black/20 dark:hover:border-white/20 transition duration-300 flex flex-col gap-1.5 dark:bg-gray-800 cursor-pointer w-full text-left">
  <div class="flex gap-2 items-center">
    <div class="relative block shrink-0 size-6 overflow-hidden bg-white dark:bg-gray-100 rounded-sm">${tile}<div class="absolute inset-0 rounded-sm ring-1 ring-inset ring-black/10 dark:ring-white/10"></div></div>
    <h4 class="font-bold dark:text-white truncate">${esc(name)}</h4>
  </div>
  <div class="text-xs leading-snug text-gray-600 dark:text-gray-400"><span class="font-semibold tabular-nums text-gray-900 dark:text-gray-100">${(c.jobs || 0).toLocaleString()}</span> open roles${meta ? ` &middot; ${esc(meta)}` : ""}</div>
</button>`;
}

function init() {
  const form = document.getElementById("filters");
  const list = document.getElementById("job-list");
  const empty = document.getElementById("empty-state");
  const loading = document.getElementById("loading-state");
  const showMore = document.getElementById("show-more");
  const count = document.getElementById("result-count");
  const companyChip = document.getElementById("company-filter");
  const companyList = document.getElementById("company-list");
  let role = "";
  let company = "";
  let cursor = null;
  let inflight = 0;

  const showChip = (name) => {
    companyChip.innerHTML = `Only jobs at <span class="font-bold dark:text-white">${esc(name)}</span> &middot; <button type="button" id="company-clear" class="text-gray-900 dark:text-white font-medium hover:underline cursor-pointer">clear</button>`;
  };

  async function load({ append = false } = {}) {
    const state = readFilters(form, role);
    // URLSearchParams serializes spaces as "+", which the API's query parser takes
    // literally; %20 is unambiguous
    const qs = buildParams({ ...state, company, cursor: append ? cursor : null }).toString().replace(/\+/g, "%20");
    companyChip.classList.toggle("hidden", !company);
    const token = ++inflight;
    loading.classList.remove("hidden");
    if (!append) {
      empty.classList.add("hidden");
      showMore.classList.add("hidden");
    }
    try {
      const res = await fetch(`/api/jobs?${qs}`);
      const data = await res.json();
      if (token !== inflight) return;
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const html = (data.jobs || []).map(row).join("");
      if (append) list.insertAdjacentHTML("beforeend", html);
      else list.innerHTML = html;
      const total = data.total_results != null ? ` of ${data.total_results.toLocaleString()}` : "";
      count.textContent = list.children.length ? `${list.children.length}${total} jobs` : "";
      empty.classList.toggle("hidden", list.children.length > 0);
      if (!list.children.length) empty.querySelector("p").textContent = "No jobs matched. Try a broader role or a longer date range.";
      cursor = data.next_cursor;
      showMore.classList.toggle("hidden", !cursor);
    } catch (err) {
      if (token !== inflight) return;
      empty.classList.remove("hidden");
      empty.querySelector("p").textContent = err.message;
    } finally {
      if (token === inflight) loading.classList.add("hidden");
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); role = ""; load(); });
  form.addEventListener("change", () => load());
  form.querySelector("#f-q").addEventListener("input", debounce(() => { role = ""; load(); }, 400));
  form.querySelector("#f-country").addEventListener("input", debounce(() => load(), 600));
  document.getElementById("roles").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-role]");
    if (!btn) return;
    role = btn.dataset.role;
    form.querySelector("#f-q").value = "";
    document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
    load();
  });
  list.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-pill]");
    if (!pill) return;
    const box = form.querySelector(`[data-arrangement="${pill.dataset.pill}"]`);
    if (box) { box.checked = true; load(); }
  });
  showMore.addEventListener("click", () => load({ append: true }));
  companyList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-company]");
    if (!btn) return;
    company = btn.dataset.company;
    role = "";
    showChip(company);
    document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
    load();
  });
  companyChip.addEventListener("click", (e) => {
    if (!e.target.closest("#company-clear")) return;
    company = "";
    load();
  });

  // fixed 30-day GTM spotlight, independent of the filter form; if it fails the
  // section hides rather than showing a bare heading
  (async () => {
    try {
      const res = await fetch("/api/jobs?view=companies&limit=8");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const html = (data.companies || []).map(companyTile).join("");
      if (!html) throw new Error("empty");
      companyList.innerHTML = html;
    } catch {
      document.getElementById("hiring").classList.add("hidden");
    }
  })();

  load();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

if (typeof document !== "undefined") init();
