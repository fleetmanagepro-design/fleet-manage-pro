import { formatCents } from "@/lib/money";
import { utcToZonedLocal } from "@/lib/zoned-time";
import { type LoadDraft, emptyStop } from "./load-draft";
import type { LoadDetail } from "./queries";

const dollars = (cents: number) => formatCents(cents).replace("$", "");

/** Empty form for a new load: one pickup and one delivery in the company's time zone. */
export function newLoadDraft(orgTimezone: string): LoadDraft {
  return {
    loadNumber: "", customerId: "", customerReference: "", linehaul: "", fuelSurcharge: "", loadedMiles: "",
    deadheadMiles: "", commodity: "", weightLbs: "", equipmentType: "", truckId: "", trailerId: "", driver1Id: "",
    driver2Id: "", notes: "",
    stops: [emptyStop("pickup", orgTimezone), emptyStop("delivery", orgTimezone)],
  };
}

/** An existing load as form values; stop times shown in each stop's local time. */
export function loadToDraft(load: LoadDetail): LoadDraft {
  return {
    id: load.id,
    loadNumber: load.load_number,
    customerId: load.customer_id,
    customerReference: load.customer_reference ?? "",
    linehaul: dollars(load.linehaul_cents),
    fuelSurcharge: dollars(load.fuel_surcharge_cents),
    loadedMiles: load.loaded_miles === null ? "" : String(load.loaded_miles),
    deadheadMiles: String(load.deadhead_miles ?? ""),
    commodity: load.commodity ?? "",
    weightLbs: load.weight_lbs === null ? "" : String(load.weight_lbs),
    equipmentType: load.equipment_type ?? "",
    truckId: load.truck_id ?? "",
    trailerId: load.trailer_id ?? "",
    driver1Id: load.drivers[0]?.driver?.id ?? "",
    driver2Id: load.drivers[1]?.driver?.id ?? "",
    notes: load.notes ?? "",
    stops: load.stops.map((s) => ({
      key: s.id,
      stopType: s.stop_type,
      facilityName: s.facility_name ?? "",
      addressLine1: s.address_line1 ?? "",
      city: s.city,
      state: s.state,
      zip: s.zip ?? "",
      timezone: s.timezone,
      appointmentStart: s.appointment_start ? utcToZonedLocal(s.appointment_start, s.timezone) : "",
      appointmentEnd: s.appointment_end ? utcToZonedLocal(s.appointment_end, s.timezone) : "",
    })),
  };
}
