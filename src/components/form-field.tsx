import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = {
  id: string;
  label: string;
  errors?: string[];
  hint?: ReactNode;
  children?: ReactNode;
} & Omit<React.ComponentProps<typeof Input>, "id">;

/**
 * Label + input + validation message. Pass `children` to render a custom
 * control (e.g. a select) instead of the default input.
 */
export function FormField({ id, label, errors, hint, children, ...inputProps }: FieldProps) {
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children ?? (
        <Input id={id} name={id} aria-invalid={errorId ? true : undefined} aria-describedby={errorId} {...inputProps} />
      )}
      {hint && !errorId && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errorId && (
        <p id={errorId} className="text-xs text-destructive">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}
