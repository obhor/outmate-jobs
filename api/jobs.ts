import type { IncomingMessage, ServerResponse } from "node:http";

// Vercel function: validates/bounds client filter params, calls JobsPipe, normalizes
// and dedups the rows. Keeps JOBSPIPE_API_KEY server-side. Ported from the gtm-jobs
// proxy; the whitelists exist because JobsPipe 400s on unknown/misspelled fields.

const UPSTREAM = "https://api.jobspipe.dev/v1/jobs/search";
const COMPANIES_UPSTREAM = "https://api.jobspipe.dev/v1/jobs/companies";
const ARRANGEMENTS = ["remote", "hybrid", "onsite"];
const SENIORITIES = ["entry_level", "mid_level", "senior", "director", "executive"];
const EMPLOYMENT = ["full-time", "part-time", "contract", "temporary", "internship"];
const DEFAULT_TITLES = [
  "Account Executive", "Account Manager", "Sales Development", "Business Development",
  "Demand Generation", "Growth Marketing", "Marketing Manager", "Product Marketing",
  "Customer Success", "Revenue Operations", "RevOps", "Sales Operations", "GTM",
];

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.end(JSON.stringify(body));
};

const int = (v: string | undefined, min: number, max: number, dflt: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse,
) {
  const q = req.query ?? {};
  // the platform query parser leaves "+" literal, so a form-encoded space would
  // never match a title; decode it the way application/x-www-form-urlencoded means
  const norm = (v: string) => v.replace(/\+/g, " ").trim();
  const str = (k: string) => {
    const v = Array.isArray(q[k]) ? q[k][0] : (q[k] as string | undefined);
    return v == null ? undefined : norm(v);
  };
  const arr = (k: string) => {
    const v = Array.isArray(q[k]) ? q[k] : q[k] ? [q[k] as string] : [];
    return v.filter((x) => typeof x === "string").map(norm);
  };
  const pick = (k: string, allowed: string[], cap = 15) =>
    arr(k).filter((v) => allowed.includes(v)).slice(0, cap);

  const key = process.env.JOBSPIPE_API_KEY;
  if (!key) return send(res, 502, { error: "Jobs API key not configured." });

  const call = (url: string, payload: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });

  const age = str("posted_at_max_age_days");
  const titles = arr("job_title_or").map((t) => t.slice(0, 60)).filter(Boolean).slice(0, 15);
  const body: Record<string, unknown> = {
    limit: int(str("limit"), 1, 25, 25),
    include_total_results: true,
    job_title_or: titles.length ? titles : DEFAULT_TITLES,
    // "anytime" in the UI = no age bound; without this the default would silently apply
    posted_at_max_age_days: age === "anytime" ? undefined : int(age, 1, 3650, 30),
  };

  const arrangements = pick("work_arrangement_or", ARRANGEMENTS);
  if (arrangements.length) body.work_arrangement_or = arrangements;

  const employment = pick("employment_type_or", EMPLOYMENT, 5);
  if (employment.length) body.employment_type_or = employment;

  const seniorities = pick("job_seniority_or", SENIORITIES, 5);
  if (seniorities.length) body.job_seniority_or = seniorities;

  const countries = arr("job_country_code_or")
    .map((c) => c.trim().toUpperCase().slice(0, 2))
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 15);
  if (countries.length) body.job_country_code_or = countries;

  const companyNames = arr("company_name_or").map((c) => c.slice(0, 80)).filter(Boolean).slice(0, 15);
  if (companyNames.length) body.company_name_or = companyNames;

  const cursor = str("cursor");
  if (cursor) body.cursor = cursor;

  // the "Hiring Now" grid: same filters, grouped by company, ranked by open roles
  if (str("view") === "companies") {
    let up: Response;
    try {
      up = await call(COMPANIES_UPSTREAM, {
        ...body,
        limit: int(str("limit"), 1, 25, 8),
        known_company_only: true,
        // staffing/broker firms aren't employers; same quality knob as the feed
        employer_type_not: ["agency", "broker"],
      });
    } catch {
      return send(res, 502, { error: "Jobs provider unreachable. Try again shortly." });
    }
    if (!up.ok) {
      const text = await up.text().catch(() => "");
      return send(res, 502, { error: `Jobs provider error (${up.status}): ${text.slice(0, 200)}` });
    }
    const d = (await up.json()) as {
      data?: Record<string, unknown>[];
      metadata?: { total_companies?: number };
    };
    // parent entities carry 0 jobs of their own; their postings sit in the subtree
    const companies = (d.data ?? [])
      .filter((c) => Number(c.jobs) > 0)
      .map((c) => ({
        name: (c.name as string) ?? "",
        logo: (c.logo as string) || undefined,
        domain: (c.domain as string) || undefined,
        jobs: Number(c.jobs) || 0,
        employee_count: (c.employee_count as number) ?? undefined,
        hq_city: (c.hq_city as string) || undefined,
        hq_country: (c.hq_country as string) || undefined,
      }));
    return send(res, 200, { companies, total_companies: d.metadata?.total_companies ?? null });
  }

  let upstream: Response;
  try {
    upstream = await call(UPSTREAM, body);
  } catch {
    return send(res, 502, { error: "Jobs provider unreachable. Try again shortly." });
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return send(res, 502, { error: `Jobs provider error (${upstream.status}): ${text.slice(0, 200)}` });
  }

  const data = (await upstream.json()) as {
    data: Record<string, unknown>[];
    metadata?: { next_cursor?: string; total_results?: number };
  };

  const seen = new Set<string>();
  const jobs: Record<string, unknown>[] = [];
  for (const j of data.data ?? []) {
    const title = (j.job_title as string) ?? "";
    const company = (j.company as string) ?? "";
    const url = (j.url as string) ?? (j.final_url as string) ?? (j.source_url as string);
    if (!url) continue;
    const dedup = `${title.toLowerCase()}|${company.toLowerCase()}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    const co = (j.company_object ?? {}) as { logo?: string };
    jobs.push({
      id: (j.id as string) ?? dedup,
      title,
      company,
      logo: co.logo || undefined,
      domain: (j.company_domain as string) || undefined,
      location: (j.location as string) ?? "",
      remote: Boolean(j.remote),
      arrangement: (j.work_arrangement as string) || undefined,
      seniority: (j.seniority as string) || undefined,
      min: (j.min_annual_salary_usd as number) ?? undefined,
      max: (j.max_annual_salary_usd as number) ?? undefined,
      posted: (j.date_posted as string) ?? "",
      url,
      employment: (j.employment_statuses as string[]) || undefined,
      source: ((j.sources as { provider?: string }[]) ?? [])[0]?.provider || undefined,
    });
  }

  send(res, 200, {
    jobs,
    next_cursor: data.metadata?.next_cursor ?? null,
    total_results: data.metadata?.total_results ?? null,
  });
}
