(function () {
  "use strict";

  const app = document.getElementById("interview-app");
  if (!app) return;

  const $ = (id) => document.getElementById(id);
  const RATINGS = ["", "1 - Weak", "2 - Fair", "3 - Good", "4 - Excellent"];

  let data = null;        // selected role's question set
  let session = [];       // [{category, items:[{question, listenFor}]}]

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function show(id, visible) { $(id).classList.toggle("hidden", !visible); }

  // Default weight from JSON, clamped to 1-5 (falls back to 3 if missing/invalid)
  function defaultWeight(c) {
    const w = Math.round(Number(c.weight));
    return w >= 1 && w <= 5 ? w : 3;
  }

  function validate(json) {
    if (!json || !Array.isArray(json.categories) || !json.categories.length)
      throw new Error("JSON must contain a non-empty 'categories' array.");
    json.categories.forEach((c) => {
      if (!c.name || !Array.isArray(c.questions))
        throw new Error("Each category needs a 'name' and a 'questions' array.");
    });
    return json;
  }

  // ---------- loading / role discovery ----------
  // The roles folder lives in the repo root; the page passes its URL in via data-roles.
  const ROLES_DIR = app.dataset.roles || "/interview-roles/";
  let roles = [];   // [{key, name, description, json, source}]

  function addRole(json, source) {
    validate(json);
    const name = String(json.role || source.replace(/\.json$/i, "")).trim();
    const key = source.toLowerCase();
    // Replace an existing entry from the same source, otherwise append
    const entry = { key, name, description: json.description || "", json, source };
    const i = roles.findIndex((r) => r.key === key);
    if (i >= 0) roles[i] = entry; else roles.push(entry);
    return entry;
  }

  // Try the directory listing first (works on simple servers like python -m http.server),
  // then interview-roles/index.json as a manifest (GitHub Pages has no directory listings). Results are merged.
  async function discoverFiles() {
    const found = new Set();
    const base = new URL(ROLES_DIR, location.href);
    try {
      const r = await fetch(base);
      if (r.ok && /html/i.test(r.headers.get("content-type") || "")) {
        const doc = new DOMParser().parseFromString(await r.text(), "text/html");
        doc.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href").split(/[?#]/)[0];
          if (/\.json$/i.test(href)) found.add(decodeURIComponent(href.split("/").pop()));
        });
      }
    } catch (_) { /* no listing available */ }
    try {
      const r = await fetch(new URL("index.json", base));
      if (r.ok) {
        const m = await r.json();
        (Array.isArray(m) ? m : m.files || []).forEach((f) => found.add(String(f).split("/").pop()));
      }
    } catch (_) { /* no manifest */ }
    found.delete("index.json");
    return [...found].sort();
  }

  async function loadRoles() {
    const errors = [];
    const files = await discoverFiles();
    await Promise.all(files.map(async (f) => {
      try {
        const r = await fetch(new URL(encodeURIComponent(f), new URL(ROLES_DIR, location.href)));
        if (!r.ok) throw new Error(r.statusText || r.status);
        addRole(await r.json(), f);
      } catch (err) { errors.push(`${f}: ${err.message}`); }
    }));
    roles.sort((a, b) => a.name.localeCompare(b.name));
    renderRoles(errors);
  }

  function renderRoles(errors = []) {
    const grid = $("role-grid");
    grid.innerHTML = roles.map((r, i) => {
      const qs = r.json.categories.reduce((n, c) => n + c.questions.length, 0);
      return `
        <button type="button" class="role-card" data-idx="${i}">
          <span class="role-card__title">${esc(r.name)}</span>
          ${r.description ? `<span class="role-card__desc">${esc(r.description)}</span>` : ""}
          <span class="tag-list">
            <span class="tag">${r.json.categories.length} categories</span>
            <span class="tag">${qs} questions</span>
          </span>
        </button>`;
    }).join("");

    $("roles-status").textContent = roles.length
      ? `${roles.length} role${roles.length === 1 ? "" : "s"} found. Pick one, or upload your own JSON.`
      : "No question sets were found automatically. Browsers block reading local folders when a page is opened directly from disk.";
    // Offer the folder picker when auto-discovery found nothing (e.g. file:// usage)
    show("folder-btn", !roles.length);
    $("load-error").textContent = errors.length ? "Skipped: " + errors.join("; ") : "";
  }

  $("role-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".role-card");
    if (card) selectRole(roles[+card.dataset.idx]);
  });

  function selectRole(r) {
    data = r.json;
    $("role").value = data.role || r.name;
    if (!$("date").value) $("date").valueAsDate = new Date();
    renderCategories();
    show("roles-section", false);
    show("setup-section", true);
    window.scrollTo(0, 0);
  }

  $("change-role-btn").addEventListener("click", () => {
    show("setup-section", false);
    show("roles-section", true);
  });

  // Read user-selected files: add every valid one to the list
  function readFiles(files) {
    const list = [...files].filter((f) => /\.json$/i.test(f.name) && f.name.toLowerCase() !== "index.json");
    if (!list.length) { $("load-error").textContent = "No .json files selected."; return Promise.resolve(); }
    const errors = [];
    let last = null;
    return Promise.all(list.map((f) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { last = addRole(JSON.parse(reader.result), f.name); }
        catch (err) { errors.push(`${f.name}: ${err.message}`); }
        resolve();
      };
      reader.onerror = () => { errors.push(`${f.name}: could not read file`); resolve(); };
      reader.readAsText(f);
    }))).then(() => {
      roles.sort((a, b) => a.name.localeCompare(b.name));
      renderRoles(errors);
      return last;
    });
  }

  $("custom-btn").addEventListener("click", () => $("custom-input").click());
  $("folder-btn").addEventListener("click", () => $("folder-input").click());

  $("custom-input").addEventListener("change", async (e) => {
    const count = e.target.files.length;
    const added = await readFiles(e.target.files);
    e.target.value = "";
    // A single custom file opens straight away
    if (added && count === 1 && !$("load-error").textContent) selectRole(added);
  });
  $("folder-input").addEventListener("change", async (e) => {
    await readFiles(e.target.files);
    e.target.value = "";
  });

  $("date").valueAsDate = new Date();
  loadRoles();

  // ---------- setup ----------
  function renderCategories() {
    $("category-list").innerHTML = data.categories
      .map((c, i) => `
        <div class="category-block">
          <div class="category-option">
            <input type="checkbox" class="cat-check" value="${i}" id="cat-${i}" checked>
            <label for="cat-${i}" class="cat-name">${esc(c.name)} <span class="count" id="count-${i}"></span></label>
            <button type="button" class="button button--ghost toggle-btn" data-cat="${i}">Choose questions ▾</button>
            <label class="weight-label">Weight
              <select id="weight-${i}" class="weight-select">
                ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === defaultWeight(c) ? " selected" : ""}>${n}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="question-picks hidden" id="picks-${i}">
            ${c.questions.map((q, qi) => `
              <label class="pick">
                <input type="checkbox" class="q-check" data-cat="${i}" value="${qi}" checked>
                <span>${esc(q.question)}</span>
              </label>`).join("")}
          </div>
        </div>`)
      .join("");

    data.categories.forEach((_, i) => syncCategory(i));
  }

  // Update the category checkbox (checked / indeterminate) and count from its question checkboxes
  function syncCategory(i) {
    const qs = [...document.querySelectorAll(`.q-check[data-cat="${i}"]`)];
    const on = qs.filter((q) => q.checked).length;
    const cb = $("cat-" + i);
    cb.checked = on > 0;
    cb.indeterminate = on > 0 && on < qs.length;
    $("count-" + i).textContent = `(${on} of ${qs.length} questions)`;
  }

  $("category-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;
    const panel = $("picks-" + btn.dataset.cat);
    panel.classList.toggle("hidden");
    btn.textContent = panel.classList.contains("hidden") ? "Choose questions ▾" : "Hide questions ▴";
  });
  $("category-list").addEventListener("change", (e) => {
    const t = e.target;
    if (t.classList.contains("cat-check")) {
      document.querySelectorAll(`.q-check[data-cat="${t.value}"]`).forEach((q) => (q.checked = t.checked));
      syncCategory(+t.value);
    } else if (t.classList.contains("q-check")) {
      syncCategory(+t.dataset.cat);
    }
  });

  function setAll(checked) {
    document.querySelectorAll("#category-list .q-check").forEach((cb) => (cb.checked = checked));
    data.categories.forEach((_, i) => syncCategory(i));
  }
  $("select-all").addEventListener("click", (e) => { e.preventDefault(); setAll(true); });
  $("select-none").addEventListener("click", (e) => { e.preventDefault(); setAll(false); });

  $("start-btn").addEventListener("click", () => {
    session = [];
    data.categories.forEach((c, i) => {
      const items = [...document.querySelectorAll(`.q-check[data-cat="${i}"]:checked`)]
        .map((cb) => c.questions[+cb.value]);
      if (items.length) session.push({ category: c.name, weight: +$("weight-" + i).value, items });
    });
    if (!session.length) { $("setup-error").textContent = "Select at least one question."; return; }
    $("setup-error").textContent = "";
    renderInterview();
    show("setup-section", false);
    show("interview-section", true);
    window.scrollTo(0, 0);
  });

  $("back-btn").addEventListener("click", () => {
    if (!confirm("Go back to setup? Starting again will clear the notes you've entered.")) return;
    show("interview-section", false);
    show("setup-section", true);
  });

  // ---------- interview ----------
  function renderInterview() {
    const name = $("candidate").value.trim() || "Candidate";
    $("interview-meta").textContent =
      [name, $("role").value.trim(), $("interviewer").value.trim() || "Interviewer", $("date").value]
        .filter(Boolean).join(" · ");

    let n = 0;
    $("questions").innerHTML = session
      .map((s, si) => `
        <h3 class="category-heading">${esc(s.category)} <span class="weight-badge">Weight ${s.weight}</span></h3>
        ${s.items.map((q, qi) => {
          n++;
          return `
          <div class="question-card" data-s="${si}" data-q="${qi}">
            <h4>${n}. ${esc(q.question)}</h4>
            ${q.listenFor ? `<p class="listen-for"><strong>Listen for:</strong> ${esc(q.listenFor)}</p>` : ""}
            <label>Notes
              <textarea class="notes" rows="4" placeholder="Type notes here..."></textarea>
            </label>
            <div class="rating-row">
              <label style="margin:0">Rating</label>
              <select class="rating">
                ${RATINGS.map((r, i) => `<option value="${i || ""}">${r || "Not rated"}</option>`).join("")}
              </select>
            </div>
          </div>`;
        }).join("")}`)
      .join("");
  }

  // ---------- report ----------
  function collect() {
    // Skip questions with no rating AND no notes, and categories left empty as a result
    return session.map((s, si) => ({
      category: s.category,
      weight: s.weight,
      items: s.items.map((q, qi) => {
        const card = document.querySelector(`.question-card[data-s="${si}"][data-q="${qi}"]`);
        const r = card.querySelector(".rating").value;
        return {
          question: q.question,
          notes: card.querySelector(".notes").value.trim(),
          rating: r ? RATINGS[+r] : ""
        };
      }).filter((i) => i.rating || i.notes)
    })).filter((s) => s.items.length);
  }

  function buildReport() {
    const sections = collect();
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

    // Per-category average (null if nothing rated)
    sections.forEach((s) => {
      const r = s.items.filter((i) => i.rating).map((i) => parseInt(i.rating, 10));
      s.count = r.length;
      s.avg = r.length ? mean(r) : null;
    });

    const scored = sections.filter((s) => s.avg !== null);
    const totalWeight = scored.reduce((a, s) => a + s.weight, 0);
    const weighted = totalWeight
      ? (scored.reduce((a, s) => a + s.avg * s.weight, 0) / totalWeight).toFixed(2) : "N/A";
    const allRated = sections.flatMap((s) => s.items).filter((i) => i.rating).map((i) => parseInt(i.rating, 10));
    const unweighted = allRated.length ? mean(allRated).toFixed(2) : "N/A";

    const breakdown = sections.map((s) => `
      <tr><td>${esc(s.category)}</td><td>${s.weight}</td>
      <td>${s.avg !== null ? s.avg.toFixed(2) : "-"}</td></tr>`).join("");

    const body = sections.map((s) => `
      <section class="shell">
        <div class="cat-head">
          <h2>${esc(s.category)}</h2>
          <span class="pill">Weight ${s.weight}</span>
          ${s.avg !== null ? `<span class="pill pill--accent">Avg ${s.avg.toFixed(2)}</span>` : ""}
        </div>
        ${s.items.map((i) => `
          <div class="q">
            <h3>${esc(i.question)}</h3>
            <p class="rating">${i.rating ? `<span class="pill pill--accent">${esc(i.rating)}</span>` : `<span class="pill">Not rated</span>`}</p>
            <p class="notes">${i.notes ? esc(i.notes).replace(/\n/g, "<br>") : "<em>No notes</em>"}</p>
          </div>`).join("")}
      </section>`).join("");

    const candidate = esc($("candidate").value || "-");
    const overall = $("overall-notes").value.trim()
      ? esc($("overall-notes").value.trim()).replace(/\n/g, "<br>") : "<em>None</em>";

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interview Report - ${candidate}</title>
<style>
  :root{--card-bg:#020617;--border:#1e293b;--text:#e5e7eb;--muted:#9ca3af;--accent:#38bdf8;--accent-soft:rgba(56,189,248,.15);color-scheme:dark}
  *{box-sizing:border-box}
  html{min-height:100%;background:radial-gradient(circle at top,#020617 0,#020617 30%,#000 100%);background-attachment:fixed;background-repeat:no-repeat;background-size:cover}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);line-height:1.5}
  .nav{position:sticky;top:0;background:rgba(2,6,23,.8);backdrop-filter:blur(10px);border-bottom:1px solid rgba(148,163,184,.25)}
  .nav div{max-width:960px;margin:0 auto;height:56px;padding:0 24px;display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .nav div::before{content:"";width:8px;height:8px;border-radius:999px;background:var(--accent);box-shadow:0 0 12px rgba(56,189,248,.7)}
  main{max-width:960px;margin:0 auto;padding:32px 24px}
  .shell{background:linear-gradient(135deg,rgba(15,23,42,.95),rgb(15,23,42));border:1px solid rgba(148,163,184,.25);border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.9),0 0 0 1px rgba(15,23,42,.8);padding:24px;margin-bottom:24px}
  h1{margin:0 0 4px;font-size:1.6rem;letter-spacing:.03em}
  h2{font-size:.9rem;margin:0;text-transform:uppercase;letter-spacing:.12em}
  h3{margin:0 0 8px;font-size:1rem;letter-spacing:.02em}
  .cat-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid rgba(56,189,248,.4)}
  .cat-head h2{color:var(--accent)}
  .pill{display:inline-flex;padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,.5);font-size:.7rem;text-transform:uppercase;letter-spacing:.09em;color:#cbd5f5;background:radial-gradient(circle at top,rgba(148,163,184,.15),transparent)}
  .pill--accent{border-color:rgba(56,189,248,.4);color:var(--accent);background:radial-gradient(circle at top,rgba(56,189,248,.1),transparent)}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:16px}
  .meta div{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
  .meta span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
  .meta strong{font-size:1.05rem}
  .meta .score strong{color:var(--accent);font-size:1.4rem}
  .subtitle{margin:0;color:var(--muted);font-size:.9rem}
  .breakdown{width:100%;border-collapse:collapse;margin-top:8px;font-size:.9rem}
  .breakdown th,.breakdown td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border)}
  .breakdown th{font-size:.7rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:500}
  .q{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px;page-break-inside:avoid}
  .q:last-child{margin-bottom:0}
  .rating{margin:0 0 8px}
  .notes{margin:0;color:var(--muted);font-size:.92rem}
  .overall{color:var(--muted);margin:8px 0 0;font-size:.95rem}
  footer{text-align:center;padding:16px 24px;font-size:.8rem;color:var(--muted);border-top:1px solid rgba(148,163,184,.15)}
  @media print{html{background:#fff}body{color:#111}.nav,footer{display:none}.shell,.q,.meta div{background:#fff;box-shadow:none;border-color:#ccc}.cat-head h2,.meta .score strong{color:#0369a1}.notes,.overall,.subtitle{color:#333}.pill,.pill--accent{color:#111;background:none}}
</style></head><body>
<div class="nav"><div>Null Routes</div></div>
<main>
  <section class="shell">
    <h1>Interview Report</h1>
    <p class="subtitle">${candidate} &middot; ${esc($("role").value || "-")} &middot; interviewed by ${esc($("interviewer").value || "-")} &middot; ${esc($("date").value || "-")}</p>
    <div class="meta">
      <div><span>Target role</span><strong>${esc($("role").value || "-")}</strong></div>
      <div class="score"><span>Weighted score (out of 4)</span><strong>${weighted}</strong></div>
      <div><span>Unweighted average</span><strong>${unweighted}</strong>${allRated.length ? ` <small>(${allRated.length} rated)</small>` : ""}</div>
      <div><span>Recommendation</span><strong>${esc($("recommendation").value || "-")}</strong></div>
    </div>
  </section>
  <section class="shell">
    <h2>Category breakdown</h2>
    <table class="breakdown"><tr><th>Category</th><th>Weight</th><th>Avg rating</th></tr>${breakdown}</table>
  </section>
  <section class="shell">
    <h2>Overall notes</h2>
    <p class="overall">${overall}</p>
  </section>
  ${body}
</main>
<footer>Interview Notes &middot; Null Routes &middot; Generated ${esc(new Date().toLocaleString())}</footer>
</body></html>`;
  }

  $("download-btn").addEventListener("click", () => {
    const blob = new Blob([buildReport()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const slug = ($("candidate").value.trim() || "candidate").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-report-${slug}-${$("date").value || "undated"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
})();
