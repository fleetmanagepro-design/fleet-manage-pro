import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/action-state";

/** Form-level success or error message from a server action. */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  return (
    <Alert variant={isError ? "destructive" : "default"} aria-live="polite">
      {isError ? <CircleAlertIcon /> : <CircleCheckIcon />}
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
