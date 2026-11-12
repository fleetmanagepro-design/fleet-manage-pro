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
- **Load revenue** ("load value") = linehaul + accessorials billed to the customer (detention, layover, lumper reimbursement, TONU, on-time bonus, etc.) − late penalties the broker deducts.
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

### Driver pay (MVP) — decided 11/10/2026 with the project owner
There are two kinds of drivers, each set up with their own rule when the driver is created (rules are dated; a new rule starts on a date, old ones stay for history):
- **Owner-operators** keep a percentage of the load value; the rest is the **company fee** (default 12%, set per driver).
  Example statement line: *Load 1042 · value $3,800.00 · −12% company fee −$456.00 · driver $3,344.00*.
  Owner-operators may drive their own truck or rent one from the company (see deductions).
- **Company drivers** are paid a rate per mile (loaded miles, or all miles incl. deadhead), set per driver.

Load value includes broker bonuses and penalties: e.g. broker pays $3,600 for 1,000 miles, +$200 if on time, −$200 if late.
The owner-operator's percentage applies to that final value.

**Driver extras** on a load (e.g. "unloaded the trailer himself" $100) are paid to the driver in full, no company fee.
They are entered on the load by dispatch or accounting.

**Deductions** are free-form per driver, set by the agreement with each driver (amounts differ per driver): a name plus one of
- % of the week's gross (e.g. truck rent 10%),
- a fixed amount per week (e.g. trailer rent $250), or
- **weekly + per mile** (decision of 11/11/2026): an optional fixed weekly amount plus a rate per mile for the miles over a
  number of free miles per week. Example: truck rent $300/week + $0.10/mi over 2,000 mi; a 2,600-mile week → $300 + 600 × $0.10 = $360.
  Miles are **all miles (loaded + empty)** of the week's paid loads; the free miles **start over every week**.
They start on a date and are ended (never deleted), so old statements stay explainable.

**Which rule applies:** the rule in effect on the load's first pickup day (company time zone).

**Weekly statements (Task 4c-2, decisions of 11/11/2026):**
- Pay week is Monday–Sunday in company time. A load belongs to the week of its **first pickup** (appointment), not its delivery
  (picked up Sunday, delivered Tuesday → the earlier week). Without a pickup appointment, its delivery day counts.
- Statement: loads (owner-operator: value − company fee; company driver: miles × rate) → **gross** → −company fee → +extras
  → −deductions → + balance carried in → **net pay**.
- **% deductions** (e.g. truck rent 10%) are taken from the **gross load value, before the company fee** ($3,800 → $380).
  For company drivers, gross is their mileage pay.
- A deduction applies to a week if it is active on any day of that week; fixed amounts are not prorated.
- **Company drivers can have deductions too** (advances, escrow, …).
- If deductions are larger than earnings, **the net goes negative and is carried into the next statement as a debt**.
- Only delivered (or invoiced/paid) loads are paid. A week with loads picked up but not delivered yet, or loads without a pay
  rule, can't be finalized; neither can a week that isn't over. Cancelled loads are not paid.
- **Finalize** stores an immutable snapshot (the numbers are recomputed on the server, never taken from the browser).
  A mistake is fixed by **voiding with a reason** and finalizing again. Weeks are finalized and voided in order, so the balance
  carried forward is always the previous finalized net. A load is paid on one live statement only.
- Owners, admins and accounting see and finalize statements; dispatchers never see pay. Print / Save as PDF from the browser.

On the load page, driver pay is computed live from the rule in effect, with a link to that driver's statement for the week.

Legacy rule shapes (flat per load, % of linehaul only, stop/detention pay) remain readable in the database but are no longer offered in the UI.

### Stops: ZIP lookup and remembered facilities (decision of 11/11/2026)
- **ZIP lookup.** Typing a stop's 5-digit ZIP fills in its city, state and local time zone. All three can still be changed.
  In states with two time zones (e.g. KY, IN, TN, TX) the form asks to check the zone.
  A ZIP that isn't in the list says so, and city and state are typed by hand.
- **Remembered facilities.** Every stop saved with a facility name is remembered for the organization: name, street,
  city, state, ZIP and time zone. Typing in the facility field suggests the matching ones, most used first.
  Picking one fills the whole stop except its appointment.
  - A stop keeps its own copy of the address, so changing a facility never changes past loads.
  - Same name + street + ZIP is one facility.
  - Facilities are never deleted (archive).
  - A screen to manage facilities comes later.

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
**Load fields**: internal load #, customer, customer reference / PO #, pickup # per pickup stop, rate confirmation document, linehaul amount (all-in: there is no separate fuel surcharge — decision of 11/12/2026), accessorials (list of type + amount), commodity, weight, equipment type, stops, assigned truck, trailer, driver(s), loaded miles, deadhead miles, notes.

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
- Load numbers are assigned automatically per company (1001, 1002, …), are unique, and can't be typed or changed by hand (decision of 11/12/2026, replacing "can be changed").
- Each pickup stop has a **Pickup #** (the shipper's pickup number); deliveries don't (decision of 11/12/2026).
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
Fields: name, phone, email, type (company driver / owner-operator / team), hire date, status, CDL number + state + class + expiry, medical card expiry, pay rule (see §3), default truck, default trailer, emergency contact, documents.

**Rules** (decided 11/09/2026)
- Drivers are never deleted: set status Inactive/Terminated, or archive.
- Pay rules are history. A raise is a new rule with an "effective from" date; a rule that is already in effect can't be changed or deleted (only future rules can). The rule used for a load is the latest one effective on or before the delivery date.
- Team drivers: each driver is paid with their own rule on the load's miles (e.g. $0.32/mi × all miles each); the rate is not split.
- The default truck is set on the driver; a truck shows the drivers who have it as default (two for a team).
- Equipment is tied to the driver (decision of 11/12/2026): the driver also has a default trailer. On a load (and on the
  dispatch board), picking the driver fills in their truck and trailer; picking a truck first suggests its driver and that
  driver's trailer. A truck or trailer chosen by hand is kept. On the load form, Assignment comes before Stops.
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
