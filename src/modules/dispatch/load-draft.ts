/** Form values for the load form (shared by the client form and server pages). */

export type StopDraft = {
  key: string;
  stopType: "pickup" | "delivery";
  facilityName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  appointmentStart: string;
  appointmentEnd: string;
  /** Pickup number on a pickup stop. */
  referenceNumber: string;
};

export type LoadDraft = {
  id?: string;
  loadNumber: string;
  customerId: string;
  customerReference: string;
  linehaul: string;
  loadedMiles: string;
  deadheadMiles: string;
  commodity: string;
  weightLbs: string;
  equipmentType: string;
  truckId: string;
  trailerId: string;
  driver1Id: string;
  driver2Id: string;
  notes: string;
  stops: StopDraft[];
};

let nextKey = 0;
const newKey = () => `s${Date.now()}-${nextKey++}`;

export function emptyStop(stopType: "pickup" | "delivery", timezone: string): StopDraft {
  return {
    key: newKey(), stopType, facilityName: "", addressLine1: "", city: "", state: "", zip: "",
    timezone, appointmentStart: "", appointmentEnd: "", referenceNumber: "",
  };
}
