import express, { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { AppError } from "../lib/errors.js";
import { pollReviewsForAllBusinesses } from "../services/reviewPolling.service.js";
import {
  getDashboardBusinessDetail,
  getDashboardOverview,
  reviewStatusLabels,
  updateBusinessWhatsappNumber
} from "../services/dashboard.service.js";

const router = Router();

router.use(express.urlencoded({ extended: false }));

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value: Date): string =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);

const formatCompactDate = (value: Date): string =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
  }).format(value);

const getStatusClassName = (status: string): string => {
  switch (status) {
    case "POSTED":
      return "status-ok";
    case "APPROVED":
      return "status-approved";
    case "ERROR":
      return "status-error";
    case "REJECTED":
      return "status-rejected";
    case "SENT_TO_WHATSAPP":
      return "status-pending";
    default:
      return "status-new";
  }
};

const renderLayout = (title: string, body: string): string => `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f6f8fc;
      --surface: #ffffff;
      --text: #1f2a37;
      --muted: #5b6678;
      --line: #e4e8f0;
      --brand: #2455f5;
      --ok: #047857;
      --warn: #b45309;
      --err: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background: radial-gradient(circle at 20% 10%, #dde5ff 0, transparent 35%), var(--bg);
      color: var(--text);
    }
    a { color: var(--brand); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; gap: 12px; }
    .title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
    .subtitle { color: var(--muted); margin: 4px 0 0; }
    .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 8px 26px rgba(32, 46, 85, 0.04);
    }
    .metric { grid-column: span 2; min-width: 0; }
    .metric h3 { margin: 0; font-size: 13px; color: var(--muted); font-weight: 600; }
    .metric p { margin: 8px 0 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
    .panel { grid-column: span 6; }
    .panel-wide { grid-column: span 12; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
    input {
      border: 1px solid #d2d8e4;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      width: 100%;
      min-width: 180px;
      background: #fff;
      color: var(--text);
    }
    button {
      border: none;
      background: var(--brand);
      color: white;
      border-radius: 10px;
      padding: 11px 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary { background: #192335; }
    button.ghost { background: #eef3ff; color: #1e40af; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #edf1f7; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .muted { color: var(--muted); }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
    }
    .status-ok { background: #dcfce7; color: var(--ok); border-color: #9fe7bb; }
    .status-approved { background: #e0e7ff; color: #3730a3; border-color: #c5ceff; }
    .status-error { background: #fee2e2; color: var(--err); border-color: #fecaca; }
    .status-rejected { background: #f3f4f6; color: #4b5563; border-color: #d1d5db; }
    .status-pending { background: #fef3c7; color: var(--warn); border-color: #fde68a; }
    .status-new { background: #e0f2fe; color: #075985; border-color: #bae6fd; }
    .status-list { display: flex; gap: 6px; flex-wrap: wrap; }
    .status-pill { background: #f4f6fb; border: 1px solid #e2e8f5; border-radius: 999px; padding: 4px 8px; font-size: 12px; }
    .notice {
      border: 1px solid #bfe0cb;
      background: #ecfdf3;
      color: #14532d;
      border-radius: 12px;
      padding: 10px 12px;
      margin: 0 0 14px;
      font-size: 14px;
    }
    .notice.warn {
      border-color: #f3d09f;
      background: #fff7ed;
      color: #9a3412;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .block-title { margin: 0 0 10px; font-size: 18px; }
    .small { font-size: 12px; color: var(--muted); }
    @media (max-width: 980px) {
      .metric { grid-column: span 6; }
      .panel { grid-column: span 12; }
    }
  </style>
</head>
<body>
  <div class="shell">
    ${body}
  </div>
</body>
</html>`;

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const overview = await getDashboardOverview();

    const oauthStatus = typeof request.query.oauth === "string" ? request.query.oauth : undefined;
    const pollStatus = typeof request.query.poll === "string" ? request.query.poll : undefined;
    const updatedStatus = typeof request.query.updated === "string" ? request.query.updated : undefined;

    const notices: string[] = [];

    if (oauthStatus === "connected") {
      const businessName =
        typeof request.query.businessName === "string" ? request.query.businessName : "Business";
      notices.push(`Google Business Profile verbunden: ${escapeHtml(businessName)}`);
    }

    if (oauthStatus === "failed") {
      notices.push("OAuth-Callback fehlgeschlagen. Details im Server-Log prüfen.");
    }

    if (pollStatus === "done") {
      const processed = typeof request.query.processed === "string" ? request.query.processed : "0";
      const created = typeof request.query.created === "string" ? request.query.created : "0";
      const errors = typeof request.query.errors === "string" ? request.query.errors : "0";
      notices.push(
        `Polling abgeschlossen: ${escapeHtml(processed)} Businesses, ${escapeHtml(created)} neue Reviews, ${escapeHtml(errors)} Fehler.`
      );
    }

    if (updatedStatus === "1") {
      notices.push("WhatsApp-Nummer wurde aktualisiert.");
    }

    const noticeHtml = notices
      .map((notice) => `<div class="notice">${notice}</div>`)
      .join("\n");

    const businessRows = overview.businesses
      .map((business) => {
        const statusList = reviewStatusLabels
          .map(
            (status) =>
              `<span class="status-pill">${status}: ${business.statusCounts[status]}</span>`
          )
          .join("");

        return `<tr>
          <td>
            <strong>${escapeHtml(business.businessName)}</strong>
            <div class="small">ID: ${escapeHtml(business.id)}</div>
          </td>
          <td>
            ${escapeHtml(business.userEmail)}
            <div class="small">${escapeHtml(business.whatsappNumber)}</div>
          </td>
          <td>
            <div class="small">${escapeHtml(business.googleAccountId)}</div>
            <div class="small">${escapeHtml(business.googleLocationId)}</div>
          </td>
          <td>${business.reviewCount}</td>
          <td><div class="status-list">${statusList}</div></td>
          <td>${formatCompactDate(business.createdAt)}</td>
          <td>
            <div class="actions">
              <a href="/dashboard/businesses/${encodeURIComponent(business.id)}">Details</a>
              <a href="/auth/google?${new URLSearchParams({
                email: business.userEmail,
                whatsappNumber: business.whatsappNumber,
                googleAccountId: business.googleAccountId,
                googleLocationId: business.googleLocationId,
                redirectTo: "/dashboard"
              }).toString()}">Reconnect OAuth</a>
            </div>
          </td>
        </tr>`;
      })
      .join("\n");

    const html = renderLayout(
      "Dashboard",
      `<div class="topbar">
        <div>
          <h1 class="title">Review Assistant Dashboard</h1>
          <p class="subtitle">Kunden, OAuth-Onboarding, Review-Workflow und manuelle Jobs.</p>
        </div>
        <form method="post" action="/dashboard/poll-reviews">
          <button class="secondary" type="submit">Reviews Jetzt Polling</button>
        </form>
      </div>
      ${noticeHtml}
      <div class="grid">
        <section class="card metric"><h3>Businesses</h3><p>${overview.totals.businesses}</p></section>
        <section class="card metric"><h3>Users</h3><p>${overview.totals.users}</p></section>
        <section class="card metric"><h3>Reviews Total</h3><p>${overview.totals.reviews}</p></section>
        <section class="card metric"><h3>Pending</h3><p>${overview.totals.pendingApprovals}</p></section>
        <section class="card metric"><h3>Posted</h3><p>${overview.totals.posted}</p></section>
        <section class="card metric"><h3>Errors</h3><p>${overview.totals.errors}</p></section>

        <section class="card panel">
          <h2 class="block-title">Kunde Verbinden</h2>
          <form method="post" action="/dashboard/start-google-auth">
            <div class="row">
              <label>E-Mail
                <input name="email" type="email" required placeholder="kunde@example.com" />
              </label>
              <label>WhatsApp Nummer
                <input name="whatsappNumber" type="text" required placeholder="+491234567890" />
              </label>
            </div>
            <div class="row">
              <label>Google Account ID (optional)
                <input name="googleAccountId" type="text" placeholder="accounts/123456789" />
              </label>
              <label>Google Location ID (optional)
                <input name="googleLocationId" type="text" placeholder="locations/123456789" />
              </label>
            </div>
            <div class="row">
              <button type="submit">OAuth Starten</button>
            </div>
          </form>
          <p class="small">Hinweis: Ohne Account/Location wird im MVP die erste verfügbare Location aus Google übernommen.</p>
        </section>

        <section class="card panel">
          <h2 class="block-title">Setup Hinweise</h2>
          <p class="muted">Twilio/OpenAI/Google API Credentials sind global in der Server-Umgebung gesetzt. Pro Kunde werden Business-Zuordnung, WhatsApp-Nummer und verschlüsselter Google Refresh Token gespeichert.</p>
          <p class="muted">Der Reply wird ausschließlich nach explizitem <code>APPROVE &lt;token&gt;</code> gepostet. Jede Freigabe wird mit Timestamp, Nummer, Review-ID und Reply-Text geloggt.</p>
        </section>

        <section class="card panel-wide">
          <h2 class="block-title">Kundenübersicht</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Kunde</th>
                  <th>Google Mapping</th>
                  <th>Reviews</th>
                  <th>Status</th>
                  <th>Erstellt</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                ${businessRows || '<tr><td colspan="7" class="muted">Noch keine Businesses verbunden.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </div>`
    );

    response.status(200).type("text/html").send(html);
  })
);

const optionalField = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().min(1).optional()
);

const startOAuthSchema = z.object({
  email: z.email(),
  whatsappNumber: z.string().min(3),
  googleAccountId: optionalField,
  googleLocationId: optionalField
});

router.post(
  "/start-google-auth",
  asyncHandler(async (request, response) => {
    const parsed = startOAuthSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("Ungültige Eingaben für OAuth-Start.", 400, parsed.error.format());
    }

    const params = new URLSearchParams({
      email: parsed.data.email,
      whatsappNumber: parsed.data.whatsappNumber,
      redirectTo: "/dashboard"
    });

    if (parsed.data.googleAccountId) {
      params.set("googleAccountId", parsed.data.googleAccountId);
    }

    if (parsed.data.googleLocationId) {
      params.set("googleLocationId", parsed.data.googleLocationId);
    }

    response.redirect(`/auth/google?${params.toString()}`);
  })
);

router.post(
  "/poll-reviews",
  asyncHandler(async (_request, response) => {
    const summary = await pollReviewsForAllBusinesses("manual");

    const params = new URLSearchParams({
      poll: "done",
      processed: String(summary.businessesProcessed),
      created: String(summary.newReviewsDetected),
      errors: String(summary.errors)
    });

    response.redirect(`/dashboard?${params.toString()}`);
  })
);

const updateWhatsappSchema = z.object({
  whatsappNumber: z.string().min(3)
});

router.post(
  "/businesses/:businessId/whatsapp",
  asyncHandler(async (request, response) => {
    const rawBusinessId = request.params.businessId;
    const businessId = Array.isArray(rawBusinessId) ? rawBusinessId[0] : rawBusinessId;

    if (!businessId) {
      throw new AppError("Business ID fehlt.", 400);
    }

    const parsed = updateWhatsappSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError("Ungültige WhatsApp Nummer.", 400, parsed.error.format());
    }

    await updateBusinessWhatsappNumber(businessId, parsed.data.whatsappNumber);

    response.redirect(`/dashboard/businesses/${encodeURIComponent(businessId)}?updated=1`);
  })
);

router.get(
  "/businesses/:businessId",
  asyncHandler(async (request, response) => {
    const rawBusinessId = request.params.businessId;
    const businessId = Array.isArray(rawBusinessId) ? rawBusinessId[0] : rawBusinessId;

    if (!businessId) {
      throw new AppError("Business ID fehlt.", 400);
    }

    const detail = await getDashboardBusinessDetail(businessId);

    const updated = request.query.updated === "1";

    const reviewRows = detail.reviews
      .map((review) => {
        const tokenHtml = review.latestApprovalToken
          ? `<div class="small">Token: ${escapeHtml(review.latestApprovalToken.token.slice(0, 16))}... · Expires ${formatDate(review.latestApprovalToken.expiresAt)}</div>`
          : '<div class="small">Kein Approval-Token</div>';

        return `<tr>
          <td>
            <strong>${escapeHtml(review.reviewerName)}</strong>
            <div class="small">Google Review: ${escapeHtml(review.googleReviewId)}</div>
            <div class="small">Rating: ${review.rating}/5</div>
          </td>
          <td>${escapeHtml(review.comment || "(No comment)")}</td>
          <td>${escapeHtml(review.aiSuggestedReply || "(not generated)")}</td>
          <td>
            <span class="badge ${getStatusClassName(review.status)}">${review.status}</span>
            ${tokenHtml}
          </td>
          <td>
            <div class="small">Create: ${formatDate(review.createTime)}</div>
            <div class="small">Update: ${formatDate(review.updateTime)}</div>
            <div class="small">Stored: ${formatDate(review.createdAt)}</div>
          </td>
        </tr>`;
      })
      .join("\n");

    const auditRows = detail.auditLogs
      .map(
        (log) => `<tr>
          <td>${formatDate(log.createdAt)}</td>
          <td><strong>${escapeHtml(log.action)}</strong></td>
          <td><pre style="margin:0; white-space:pre-wrap; font-size:12px; line-height:1.35; color:#344054;">${escapeHtml(JSON.stringify(log.metadata, null, 2))}</pre></td>
        </tr>`
      )
      .join("\n");

    const statusSummary = reviewStatusLabels
      .map((status) => `<span class="status-pill">${status}: ${detail.statusCounts[status]}</span>`)
      .join("");

    const html = renderLayout(
      `Business: ${detail.business.businessName}`,
      `<div class="topbar">
        <div>
          <a href="/dashboard">← Zurück zum Dashboard</a>
          <h1 class="title" style="margin-top:8px;">${escapeHtml(detail.business.businessName)}</h1>
          <p class="subtitle">${escapeHtml(detail.business.userEmail)} · Erstellt ${formatDate(detail.business.createdAt)}</p>
        </div>
        <div class="actions">
          <a href="/auth/google?${new URLSearchParams({
            email: detail.business.userEmail,
            whatsappNumber: detail.business.whatsappNumber,
            googleAccountId: detail.business.googleAccountId,
            googleLocationId: detail.business.googleLocationId,
            redirectTo: `/dashboard/businesses/${detail.business.id}`
          }).toString()}">OAuth Reconnect</a>
          <form method="post" action="/dashboard/poll-reviews">
            <button class="secondary" type="submit">Polling Jetzt</button>
          </form>
        </div>
      </div>

      ${updated ? '<div class="notice">WhatsApp-Nummer gespeichert.</div>' : ""}

      <div class="grid">
        <section class="card panel">
          <h2 class="block-title">Business Konfiguration</h2>
          <div class="row" style="margin-bottom:12px;">
            <div><div class="small">Google Account</div><div>${escapeHtml(detail.business.googleAccountId)}</div></div>
            <div><div class="small">Google Location</div><div>${escapeHtml(detail.business.googleLocationId)}</div></div>
          </div>
          <form method="post" action="/dashboard/businesses/${encodeURIComponent(detail.business.id)}/whatsapp">
            <div class="row">
              <label>WhatsApp Nummer
                <input type="text" name="whatsappNumber" value="${escapeHtml(detail.business.whatsappNumber)}" required />
              </label>
              <div style="display:flex;align-items:end;">
                <button type="submit">Nummer Aktualisieren</button>
              </div>
            </div>
          </form>
        </section>

        <section class="card panel">
          <h2 class="block-title">Status Übersicht</h2>
          <div class="status-list">${statusSummary}</div>
          <p class="small" style="margin-top:10px;">Pending in diesem Business: ${
            detail.statusCounts.NEW +
            detail.statusCounts.SENT_TO_WHATSAPP +
            detail.statusCounts.APPROVED
          }</p>
        </section>

        <section class="card panel-wide">
          <h2 class="block-title">Reviews</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reviewer</th>
                  <th>Review</th>
                  <th>AI Reply</th>
                  <th>Status</th>
                  <th>Timestamps</th>
                </tr>
              </thead>
              <tbody>
                ${reviewRows || '<tr><td colspan="5" class="muted">Noch keine Reviews vorhanden.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card panel-wide">
          <h2 class="block-title">Audit Logs</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Action</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                ${auditRows || '<tr><td colspan="3" class="muted">Keine Audit Logs vorhanden.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </div>`
    );

    response.status(200).type("text/html").send(html);
  })
);

export const dashboardRoutes = router;
