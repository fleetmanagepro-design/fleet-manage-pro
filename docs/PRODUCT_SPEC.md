# Fleet Manage Pro — Product Specification (MVP)

Version 0.1 · Status: draft for review · Website: fleetmanagepro.com · App: app.fleetmanagepro.com

## 1. Product summary

Fleet Manage Pro is a web TMS for US trucking carriers that combines dispatch, fleet, maintenance and money in one place, built around one question:

> **"Where am I making money, and where am I losing it?"**

Most small-carrier tools track loads well but treat costs as an afterthought. Fleet Manage Pro makes cost per mile, profit per truck/trailer/load and maintenance spend the center of the product.

### Target customers (MVP)
- Primary: carriers with **5–50 trucks** (owner runs the business, 1–3 office staff, often still on spreadsheets).
- Secondary: owner-operators with 1–4 trucks (cheaper plan, same product).
- Later: 50–500 trucks (architecture must support it; MVP UI does not need to be optimized for it).

### Users and roles
| Role | Who | Access |
|---|---|---|
| Owner | Company owner | Everything, incl. billing, users, all financials |
| Admin | Office manager | Everything except billing and deleting the company |
| Dispatcher | Dispatch staff | Loads, drivers, trucks, trailers; sees load revenue, not company P&L |
| Maintenance | Shop / fleet manager | Trucks, trailers, maintenance, tires, related expenses |
| Accounting | Bookkeeper | Expenses, invoices, payments, reports |
| Viewer | Investor / partner | Read-only dashboards and reports |

Drivers do not log in during MVP (driver app is Phase 2).

## 2. MVP scope

### In scope
1. Accounts, organizations, users, roles
2. Dashboard (company health at a glance)
3. Customers (brokers / shippers)
4. Loads & simple dispatch board
5. Trucks
6. Trailers
7. Drivers (profiles, pay rules, compliance dates)
8. Expenses (incl. fuel) and recurring fixed costs
9. Maintenance: work orders, preventive maintenance schedules, tires
10. Invoicing (basic) and payment status
11. Profitability reports
12. Documents (upload and link to records)
13. Alerts (expirations, maintenance due, unpaid invoices)
14. CSV import for trucks, trailers, drivers, customers, expenses

### Out of scope for MVP (Phase 2+)
Driver mobile app · full driver settlements with statements · ELD/GPS integrations · fuel card imports · QuickBooks sync · load boards · factoring integration · IFTA reports · OCR · AI assistant · Stripe billing (MVP pilots are invoiced manually).

## 3. Core business definitions

These definitions are used everywhere. Implement once in `calculations.ts`.

### Miles
- **Loaded miles**: miles with freight on a load.
- **Deadhead (empty) miles**: miles driven to the pickup without freight. Stored on the load.
- **Total miles** = loaded + deadhead.
- **Empty mile %** = deadhead ÷ total miles.
- MVP: miles are entered manually per load (Mapbox auto-calculation is Phase 2).

### Revenue
- **Load revenue** = linehaul + fuel surcharge + accessorials (detention, layover, lumper reimbursement, TONU, etc.).
- Revenue is recognized on the load's **delivery date** for reporting periods.

### Costs — three levels
Every expense is attached to exactly one level:
1. **Load-direct** — belongs to one load (lumper, tolls on that trip, driver pay for that load).
2. **Equipment** — belongs to a truck or trailer (fuel, repairs, tires, truck payment, plates).
3. **Company overhead** — belongs to no asset (office rent, software, insurance if not split, salaries).

Fixed recurring costs (truck payment, insurance, trailer lease) are entered once as **recurring costs** and generate monthly expense entries automatically.

### Key metrics (for any period)
- **RPM** (revenue per mile) = revenue ÷ total miles
- **CPM** (cost per mile) = all costs ÷ total miles
- **Truck CPM** = (equipment costs of the truck + load-direct costs of its loads + its share of overhead) ÷ truck's total miles
- **Trailer CPM** = trailer equipment costs ÷ miles the trailer moved on loads
- **Overhead allocation** (default): company overhead is split across trucks by miles in the period. Setting: allocate by miles (default) / equally per active truck / don't allocate.
- **Profit** = revenue − costs
- **Load contribution** = load revenue − load-direct costs (incl. driver pay)
- **Load estimated profit** = load contribution − (truck's trailing 90-day CPM excluding driver pay × load total miles). Shown as an estimate and labeled as such.
- **Maintenance CPM** = repair + PM + tire costs ÷ miles (per truck and per trailer).

### Driver pay (MVP)
Each driver has one pay rule:
- per mile (loaded only, or all miles), or
- % of load revenue (linehaul only, or linehaul + FSC), or
- flat per load.
Plus optional per-load extras (stop pay, detention pay) and deductions.
Driver pay is calculated automatically when a load is marked Delivered and stored as a load-direct expense (editable, with audit trail).

## 4. Modules and screens

Each module lists screens, key fields, business rules and **acceptance criteria (AC)**.

### 4.1 Accounts & organizations
- Sign up with email + password (Supabase Auth); email verification required.
- First user creates the organization: company name, USDOT number, MC number (optional), address, time zone.
- Owner invites users by email with a role.
- A user may belong to multiple organizations and switch between them.

**Rules** (decided 11/09/2026)
- Only an Owner can grant the Owner role (invite an owner or promote a member). Admins can invite and manage every other role, but cannot change or remove an Owner.
- An organization must always have at least one Owner: the last Owner cannot be demoted, removed or leave.
- Invitations expire after 7 days, are single-use, and can only be accepted by a signed-in user whose verified email matches the invitation. Accepting an invitation to an org the user already belongs to keeps their current role.

**AC**
- A user from Org A cannot see, query or modify any record of Org B (verified by automated tests per table).
- Removing a user immediately revokes access.
- Every role sees only the menus and data its role allows.

### 4.2 Dashboard
Period selector: this week / this month / last month / quarter / year / custom.

Cards: Revenue · Costs · Profit & margin % · RPM · CPM · Total miles · Empty mile % · Loads delivered · Open receivables (and >30 days overdue) · Maintenance due/overdue count · Expiring documents (next 30 days).

Lists: Top 5 and bottom 5 trucks by profit · Top 5 costliest trailers by maintenance CPM · Loads in progress.

**AC**
- All numbers match the Reports module for the same period.
- Loads in under 2 seconds for an org with 50 trucks and 2 years of data.
- Each card links to the underlying list.

### 4.3 Customers
Fields: name, type (broker / shipper / both), MC number, contact(s), billing email, payment terms (days), notes, status (active / do-not-use).

**Rules** (decided 11/09/2026)
- Status: Active, Inactive (not working with them now), Do not use (requires a reason; such a customer can't be put on new loads).
- MC number is unique within the company among non-archived customers; names may repeat.
- Customers are never deleted, only archived. Contacts (name, role, email or phone) can be added and removed.
- Owner, Admin, Dispatcher and Accounting edit customers; Maintenance and Viewer read them.

**AC**: cannot delete a customer with loads; can mark inactive.

### 4.4 Loads & dispatch
**Load fields**: internal load #, customer, customer reference / PO #, rate confirmation document, linehaul amount, fuel surcharge, accessorials (list of type + amount), commodity, weight, equipment type, stops, assigned truck, trailer, driver(s), loaded miles, deadhead miles, notes.

**Stops**: ordered list; each has type (pickup / delivery), facility name, address, city, state, ZIP, appointment window, actual arrival / departure.

**Statuses**: `planned → dispatched → at_pickup → in_transit → delivered → invoiced → paid`, plus `cancelled` (with reason; TONU allowed).

**Screens**
- Load list (filters: status, date, customer, truck, driver).
- Load detail (all info, documents, expenses, status history, profitability box).
- Dispatch board: trucks as rows, days as columns, loads as blocks; shows unassigned loads. Drag a load onto a truck to assign (MVP may use a select instead of drag-and-drop if needed).

**Rules**
- A truck or driver cannot be on two overlapping loads (warn, allow override by Admin/Owner with reason).
- Moving to `delivered` requires actual delivery date and miles; triggers driver pay calculation.
- Moving to `invoiced` creates an invoice (see 4.10).
- Every status change creates a `load_events` record (who, when, from, to).

**Decisions** (11/10/2026)
- Load numbers are assigned automatically per company (1001, 1002, …) and can be changed; they stay unique.
- Status moves forward freely. Moving back (or reactivating a cancelled load) is allowed for Owner, Admin and Dispatcher with a required reason, recorded in the load history. A delivered load must be moved back before it can be cancelled.
- Stop appointments are entered in the facility's local time; the time zone is suggested from the stop's state and can be changed.
- Dispatching needs a truck, a driver, a pickup and a delivery. A do-not-use or archived customer, a sold/archived truck or trailer, and an inactive driver or one with an expired CDL/medical card can't be put on an open load.
- Overlap check uses each load's window (earliest appointment → latest appointment). Dispatchers are blocked; Owner/Admin can save with a reason, recorded in the history.
- Revenue counts accessorials only when they are billed to the customer.
- Dispatch board (decided 11/10/2026): 7 days from today with previous/next week; days are in the company's time zone.
  Assignment from the board is by choosing truck and driver for each unassigned load (no drag-and-drop yet);
  the same overlap rule applies.

**AC**
- Dispatcher can create a 2-stop load and assign it in under 1 minute.
- Load detail shows revenue, direct costs, contribution, estimated profit and RPM.

### 4.5 Trucks
Fields: unit #, VIN, year, make, model, plate + state, ownership (owned / financed / leased), purchase date & price, current odometer, status (active / in shop / out of service / sold), assigned driver, registration expiry, annual inspection date, insurance expiry, notes, documents.

Truck detail tabs: Overview (profit, RPM, CPM, maintenance CPM for selected period) · Loads · Expenses · Maintenance · Documents.

**Rules** (decided 11/09/2026)
- Unit numbers are unique per company among non-archived trucks; trucks and trailers have separate numbering (truck 101 and trailer 101 may both exist). VINs are unique among non-archived trucks.
- Trucks and trailers are never deleted, only archived (history and costs stay). Archiving frees the unit number and VIN.
- VIN: 17 characters, no I/O/Q (required for trucks, optional for trailers). A wrong check digit is shown as a warning only.
- Sold assets are read-only and will not be offered for load assignment. Only an Owner or Admin can mark an asset sold or change a sold status.
- Dispatchers can change the status of trucks and trailers, nothing else.
- Inspections: the user enters the date of the last inspection and how long it is valid (3, 6, 9 or 12 months; default 12). The due date is computed from those two and flagged 30 days ahead.
- Odometer, hubodometer and reefer hours are kept as a history of readings. A reading lower than the current value is a correction: Owner/Admin only, with a reason, and audited.

**AC**: odometer can only increase (correction requires Admin and is audited); expirations within 30 days create alerts.

### 4.6 Trailers
Fields: unit #, VIN, year, make, type (dry van / reefer / flatbed / step deck / other), length, plate + state, ownership, hubodometer reading (optional), status, registration expiry, annual inspection date, reefer unit hours (reefer only), notes, documents.

Trailer miles: sum of total miles of loads the trailer was assigned to, plus manual hubodometer readings if entered.

Trailer detail: maintenance history, tires by position, maintenance CPM, total cost of ownership, loads.

**AC**: trailer maintenance CPM is visible per trailer and comparable across the fleet.

### 4.7 Drivers
Fields: name, phone, email, type (company driver / owner-operator / team), hire date, status, CDL number + state + class + expiry, medical card expiry, pay rule (see §3), default truck, emergency contact, documents.

**Rules** (decided 11/09/2026)
- Drivers are never deleted: set status Inactive/Terminated, or archive.
- Pay rules are history. A raise is a new rule with an "effective from" date; a rule that is already in effect can't be changed or deleted (only future rules can). The rule used for a load is the latest one effective on or before the delivery date.
- Team drivers: each driver is paid with their own rule on the load's miles (e.g. $0.32/mi × all miles each); the rate is not split.
- The default truck is set on the driver; a truck shows the drivers who have it as default (two for a team).
- Who sees pay: Owner, Admin, Accounting. Dispatch and Maintenance see drivers without pay; Viewers see no drivers.

**AC**: CDL and medical card expiry produce alerts at 60 and 30 days and on expiry; assigning an expired driver to a load shows a blocking warning.

### 4.8 Expenses
Fields: date, category, amount, vendor, payment method, level (load / truck / trailer / company) + linked record, description, receipt document, fuel-only fields (gallons, price per gallon, state, odometer).

Categories (editable list, defaults): Fuel · DEF · Driver pay · Repairs · Preventive maintenance · Tires · Truck payment/lease · Trailer payment/lease · Insurance · Permits & licenses · Tolls · Lumper · Parking · Factoring fees · Office & software · Salaries · Other.

Recurring costs: amount, category, level + linked record, frequency (monthly / weekly / yearly), start/end date.

**AC**
- Expenses are never hard-deleted; void requires a reason and is audited.
- A fuel expense with gallons and odometer updates truck MPG statistics.
- Totals by category and by level match the Reports module.

### 4.9 Maintenance
**Work orders**: asset (truck or trailer), date opened/closed, type (repair / preventive / inspection / breakdown / tire), odometer or hubodometer, vendor or in-house, line items (parts, labor, description, cost), downtime days, documents. Closing a work order creates the matching expense(s) automatically.

**Preventive maintenance (PM) schedules**: per asset or per asset type; interval by miles and/or days (and reefer hours); last done; next due. Status: OK / due soon (default 10% of interval or 14 days) / overdue.

Default PM templates (editable): truck oil & filter service, truck annual inspection, trailer annual inspection, trailer brake & wheel-end service, reefer service.

**Tires**: tire record with brand, size, DOT code, purchase date, cost, status (in service / spare / retread / scrapped), current asset + position (e.g. axle 2 left outer), tread depth readings with date. Moving a tire between assets is recorded.

**AC**
- Overdue PM appears on the dashboard and on the asset.
- Maintenance CPM per asset is computed from closed work orders and tire costs.
- Tire history shows every position and asset the tire has been on.

### 4.10 Invoicing & receivables
- Invoice created from one load (MVP; multi-load invoices later).
- Invoice #, date, due date (from customer terms), line items from load revenue, PDF generated with company info.
- Status: draft / sent / partially paid / paid / voided.
- Record payments (date, amount, method, reference). Factored invoices: mark as factored, record factoring fee as expense.
- Aging report: current / 1–30 / 31–60 / 61–90 / 90+ days.

**AC**: invoice totals always equal load revenue at the time of invoicing; changes after invoicing require voiding and reissuing.

### 4.11 Reports
All reports have period filter and CSV export.
- Profit & loss (company) by month
- Profitability by truck (revenue, miles, RPM, CPM, profit, margin)
- Profitability by driver
- Profitability by customer / lane (origin state → destination state)
- Load profitability list (contribution and estimated profit)
- Trailer cost report (maintenance CPM, tire spend, total cost)
- Maintenance spend by asset and category
- Fuel report (gallons, spend, MPG by truck)
- Receivables aging

**AC**: every report number can be traced to underlying records (click-through).

### 4.12 Documents
Upload PDF/JPG/PNG (max 20 MB) to Supabase Storage; link to load, truck, trailer, driver, expense, work order or company. Types: rate confirmation, BOL, POD, invoice, receipt, registration, insurance certificate, inspection report, CDL, medical card, other. Optional expiry date → alerts.

**AC**: files are private per organization (Storage policies), accessed via short-lived signed URLs.

### 4.13 Alerts
Generated daily and shown in an alert center + dashboard:
expiring registrations, inspections, insurance, CDL, medical cards · PM due/overdue · invoices overdue · loads delivered but not invoiced after 2 days.
Email digest (daily, opt-in) for Owner/Admin.

### 4.14 CSV import
Templates for trucks, trailers, drivers, customers, expenses. Preview with validation errors before import. Import is all-or-nothing per file.

## 5. Non-functional requirements
- **Security**: RLS on all tables; role checks server-side; audit log for create/update/void on financial and asset records; HTTPS only.
- **Performance**: list pages < 1.5 s, dashboard < 2 s at 50 trucks / 2 years of data.
- **Reliability**: daily database backups (Supabase), tested restore procedure before first paying customer.
- **Data ownership**: owner can export all data as CSV at any time.
- **Browser support**: latest Chrome, Edge, Safari; usable on a tablet; phone layout is "view-friendly", not optimized.
- **Time zones**: store UTC; display in organization time zone; stops use the facility's local time.

## 6. Pricing (to validate with pilots)
| Plan | Price |
|---|---|
| Starter (1–4 trucks) | $99 / month |
| Growth | $199 + $15 per truck / month |
| Professional | $399 + $18 per truck / month |

Pilot customers: free for 90 days in exchange for weekly feedback.

## 7. Open questions (answer through customer interviews)
1. Do target carriers do their own invoicing or use factoring for most loads?
2. Is "profit per truck" the number owners care about most, or cash flow?
3. How do they track trailer maintenance today (if at all)?
4. Which ELD provider do they use? (decides first integration in Phase 2)
5. Would they pay more for automatic fuel card import?
6. Do dispatchers need to see load revenue?
