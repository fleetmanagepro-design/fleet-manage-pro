"""
Builds the us_zip_codes migration from two public data files (read as data, never executed):
  - npm `zipcodes@8.0.0` lib/codes.js (BSD; ZIP → city, state; source federalgovernmentzipcodes.us)
  - npm `zipcode-to-timezone@0.0.9` zipcodes.json (MIT; ZIP → time zone; source zip2timezone)
Usage: python3 -I build-migration.py <codes.js> <zipcodes.json> <out.sql>
Time zones are normalized to the zones a stop can use (src/lib/us.ts STOP_TIME_ZONES), and known errors in
split-state data are corrected by 3-digit ZIP prefix (decision of 11/11/2026; checked against county maps).
"""
import json, re, sys

codes_js, tz_json, out = sys.argv[1:4]
raw = open(codes_js, encoding="utf-8").read().strip()
assert raw.startswith("exports.codes = ")
# The file is `exports.codes = {...};\nexports.stateMap = ...`: decode only the first object.
codes, _ = json.JSONDecoder().raw_decode(raw[len("exports.codes = "):])
tzmap = json.load(open(tz_json, encoding="utf-8"))

TZ_INDEX = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Kentucky/Louisville", "America/Indiana/Indianapolis", "America/Detroit", "America/Boise",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Indiana/Knox", "America/Indiana/Winamac",
  "America/Indiana/Vevay", "America/Indiana/Marengo", "America/Indiana/Vincennes", "America/Indiana/Tell_City",
  "America/Indiana/Petersburg", "America/Menominee", "America/Shiprock", "America/Nome", "America/Juneau",
  "America/Kentucky/Monticello", "America/North_Dakota/Center", "America/Yakutat"]
NORMALIZE = {
  "America/Kentucky/Louisville": "America/New_York", "America/Kentucky/Monticello": "America/New_York",
  "America/Indiana/Winamac": "America/Indiana/Indianapolis", "America/Indiana/Vevay": "America/Indiana/Indianapolis",
  "America/Indiana/Marengo": "America/Indiana/Indianapolis", "America/Indiana/Vincennes": "America/Indiana/Indianapolis",
  "America/Indiana/Petersburg": "America/Indiana/Indianapolis",
  "America/Indiana/Knox": "America/Chicago", "America/Indiana/Tell_City": "America/Chicago",
  "America/Menominee": "America/Chicago", "America/North_Dakota/Center": "America/Chicago",
  "America/Shiprock": "America/Denver", "America/Nome": "America/Anchorage", "America/Juneau": "America/Anchorage",
  "America/Yakutat": "America/Anchorage",
}
# Whole 3-digit areas the source has in the wrong zone.
PREFIX_FIX = {
  "420": "America/Chicago", "421": "America/Chicago", "422": "America/Chicago", "423": "America/Chicago",
  "424": "America/Chicago",  # western Kentucky (Paducah, Bowling Green, Hopkinsville, Owensboro, Henderson)
  "463": "America/Chicago", "464": "America/Chicago",  # NW Indiana (Gary, Hammond, Lake/Porter)
  "476": "America/Chicago", "477": "America/Chicago",  # SW Indiana (Evansville)
}
STATE_DEFAULT = {
  "AL": "America/Chicago", "AK": "America/Anchorage", "AZ": "America/Phoenix", "AR": "America/Chicago",
  "CA": "America/Los_Angeles", "CO": "America/Denver", "CT": "America/New_York", "DE": "America/New_York",
  "DC": "America/New_York", "FL": "America/New_York", "GA": "America/New_York", "HI": "Pacific/Honolulu",
  "ID": "America/Boise", "IL": "America/Chicago", "IN": "America/Indiana/Indianapolis", "IA": "America/Chicago",
  "KS": "America/Chicago", "KY": "America/New_York", "LA": "America/Chicago", "ME": "America/New_York",
  "MD": "America/New_York", "MA": "America/New_York", "MI": "America/Detroit", "MN": "America/Chicago",
  "MS": "America/Chicago", "MO": "America/Chicago", "MT": "America/Denver", "NE": "America/Chicago",
  "NV": "America/Los_Angeles", "NH": "America/New_York", "NJ": "America/New_York", "NM": "America/Denver",
  "NY": "America/New_York", "NC": "America/New_York", "ND": "America/Chicago", "OH": "America/New_York",
  "OK": "America/Chicago", "OR": "America/Los_Angeles", "PA": "America/New_York", "RI": "America/New_York",
  "SC": "America/New_York", "SD": "America/Chicago", "TN": "America/Chicago", "TX": "America/Chicago",
  "UT": "America/Denver", "VT": "America/New_York", "VA": "America/New_York", "WA": "America/Los_Angeles",
  "WV": "America/New_York", "WI": "America/Chicago", "WY": "America/Denver",
}
ALLOWED_TZ = {"America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Detroit", "America/Indiana/Indianapolis", "America/Boise"}

def city_case(c):
    c = re.sub(r"\s+", " ", c.strip())
    return c if not c.isupper() else c.title()

rows, stats = [], {"state_default": 0, "prefix_fix": 0, "skipped": 0}
for z, r in sorted(codes.items()):
    st = (r.get("state") or "").upper()
    if not re.fullmatch(r"\d{5}", z) or st not in STATE_DEFAULT or not r.get("city"):
        stats["skipped"] += 1
        continue
    idx = tzmap.get(z)
    tz = TZ_INDEX[idx] if isinstance(idx, int) and 0 <= idx < len(TZ_INDEX) else None
    if tz is None:
        tz = STATE_DEFAULT[st]; stats["state_default"] += 1
    tz = NORMALIZE.get(tz, tz)
    if st in ("KY", "IN") and z[:3] in PREFIX_FIX and tz != PREFIX_FIX[z[:3]]:
        tz = PREFIX_FIX[z[:3]]; stats["prefix_fix"] += 1
    assert tz in ALLOWED_TZ, (z, tz)
    rows.append((z, city_case(r["city"]), st, tz))

q = lambda s: "'" + s.replace("'", "''") + "'"
with open(out, "w", encoding="utf-8") as f:
    f.write("""-- 0004f_us_zip_codes
-- US ZIP codes → city, state, time zone, so a stop fills itself in from its ZIP (decision of 11/11/2026).
-- Reference data shared by every organization (the one table without organization_id: it holds no tenant data).
-- Read-only for users; generated by scripts/zip-data/build-migration.py — see docs/THIRD_PARTY_DATA.md for sources and licenses.

create table public.us_zip_codes (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  timezone text not null
);

alter table public.us_zip_codes enable row level security;
create policy "everyone signed in reads" on public.us_zip_codes for select to authenticated using (true);
revoke all on public.us_zip_codes from anon;
revoke insert, update, delete, truncate on public.us_zip_codes from authenticated;
grant select on public.us_zip_codes to authenticated;

""")
    for i in range(0, len(rows), 1000):
        f.write("insert into public.us_zip_codes (zip, city, state, timezone) values\n")
        f.write(",\n".join(f"({q(z)},{q(c)},{q(s)},{q(t)})" for z, c, s, t in rows[i:i + 1000]))
        f.write(";\n")
print(len(rows), stats)
