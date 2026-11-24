# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Approvers (4 executives):** Director, CFO, CO-CEO 1 and CO-CEO 2 of Grupo Vallas. They open the Approval Center from a Slack DM ("Ver en NetSuite") or from NetSuite, about half on phone and half on desktop, and approve or discard the vendor bills waiting at their level, often in batches before or after the weekly payment meeting.
- **Treasury:** opens the read-only "Facturas autorizadas por pagar" view from a Slack notice to see what is authorized and still unpaid.
- **CXP (accounts payable):** prepares the weekly proposal; reads Slack summaries and discard notices. Does not approve in the Center.

## Product Purpose

Replace payment authorization by WhatsApp and email with an ordered, logged flow inside NetSuite: each bill passes Director → CFO → CO-CEO 1 → CO-CEO 2, and every action is recorded (who, when, from where, why). Success: executives clear their pending bills quickly and confidently, Treasury pays only what is authorized, and work stays in NetSuite instead of Excel.

## Positioning

An internal tool for one company (SDF Account Customization), built around Grupo Vallas' real weekly payment meeting and approval chain, running inside the users' NetSuite session.

## Operating Context

- Weekly cycle: Monday the proposal ("concentrado") is generated and approvers get a Slack DM; Saturday pending lines expire.
- The Center is a page served by a NetSuite Suitelet (`ui/gpv_approval_center.html`): single HTML file with inline CSS and vanilla JS, no build step, deployed to the File Cabinet.
- Users are already logged into NetSuite; bill numbers link to the native vendor bill.

## Capabilities and Constraints

- Approver view: bills waiting for the user, grouped by proposal and level; one table per currency (USD first, then MXN); ordered by vendor priority (Alto, Medio, Bajo, none), then amount high to low; priority badge next to the vendor; select per table or per group; approve with total confirmation; discard with reason; batches may be processed in parts ("faltan N").
- Treasury view (`?view=authorized`): same page, read-only, authorized bills whose vendor bill is still open.
- API: `GET ?action=pending|authorized`, `POST ?action=approve|discard` with header `X-GPV-Request: 1`. The page renders all data with `textContent`.
- Must work on phone and desktop. Spanish UI. Currencies MXN and USD.
- CSV download from the Center was deliberately not added (keep work in NetSuite, not Excel).

## Brand Commitments

- Must read clearly as **Grupo Vallas** (confirmed by the user, 24 nov 2026). Reference: the company website, charcoal gray and orange on white with a humanist sans (Avenir-like).
- The user will provide the Grupo Vallas logo (SVG or PNG) for the header.
- Slack app name in the test workspace: "Asistente NetSuite".

## Evidence on Hand

- Real data comes from NetSuite at runtime; no static content, testimonials or metrics to show.
- Logo: pending from the user. Do not draw or approximate a logo.

## Product Principles

1. The decision comes first: what is waiting, how much, and in which currency must be obvious at a glance.
2. Approving money is deliberate: confirmation with totals, clear discard with a reason, no accidental actions.
3. Same experience on phone and desktop.
4. Stay inside NetSuite; nothing that pushes work back to Excel or chat.

## Accessibility & Inclusion

Keyboard operable, visible focus, labeled checkboxes, live status messages, reduced-motion respected (already present in the incumbent page; keep it).
