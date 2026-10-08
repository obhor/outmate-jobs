// node test/params.test.mjs — guards the client→JobsPipe filter mapping.
// Field names here must match api/jobspipe (see build/../api/jobs.ts whitelists);
// a typo means HTTP 400 on every request, not a silent no-op.
import assert from "node:assert/strict";
import { buildParams, relativeTime } from "../assets/app.js";

const p = (f) => Object.fromEntries(buildParams(f));

// defaults: no filters -> default 30 days, no title override (proxy supplies GTM titles)
assert.deepEqual(p({}), { posted_at_max_age_days: "30" });

// single-value filters use the singular `_or` field names JobsPipe validates
assert.deepEqual(p({ q: "RevOps" }), { job_title_or: "RevOps", posted_at_max_age_days: "30" });
assert.equal(p({ country: "DE" }).job_country_code_or, "DE");

// UI snake_case employment ids map to JobsPipe's hyphenated enum
assert.deepEqual(buildParams({ employment: ["full_time", "contractor"] }).getAll("employment_type_or"), ["full-time", "contract"]);
// employer types are checked separately and must never leak into employment_type_or
assert.deepEqual(
  buildParams({ arrangements: ["remote", "hybrid"] }).getAll("work_arrangement_or"),
  ["remote", "hybrid"],
);

// experience buckets expand to seniority enums
assert.deepEqual(buildParams({ seniority: ["director", "executive"] }).getAll("job_seniority_or"), ["director", "executive"]);

// "anytime" must survive as the sentinel the proxy understands, not a number
assert.equal(p({ since: "anytime" }).posted_at_max_age_days, "anytime");
assert.equal(p({ since: "24h" }).posted_at_max_age_days, "1");

// a role click and a typed query both drive job_title_or, cursor only when paginating
assert.equal(p({ role: "Account Executive" }).job_title_or, "Account Executive");
assert.equal(p({ cursor: "abc" }).cursor, "abc");
assert.equal(p({}).cursor, undefined);

const now = Date.now();
assert.equal(relativeTime(new Date(now - 90 * 60000).toISOString()), "2 hours ago");
assert.equal(relativeTime(new Date(now - 30 * 3600000).toISOString()), "1 day ago");
assert.equal(relativeTime(""), "");

console.log("params: all assertions passed");
