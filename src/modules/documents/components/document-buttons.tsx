"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { archiveDocument, documentUrl } from "../actions";

/** Opens the document in a new tab through a one-minute signed link. */
export function OpenDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const [error, setError] = useState(false);
  return (
    <span className="grid justify-items-end">
      <Button type="button" size="sm" variant="outline" aria-label={`Open ${fileName}`}
        onClick={async () => {
          setError(false);
          // Open the tab right away (inside the click) so pop-up blockers allow it, then point it at the file.
          const tab = window.open("", "_blank");
          const url = await documentUrl(id);
          if (url && tab) tab.location.href = url;
          else {
            tab?.close();
            setError(true);
          }
        }}>
        Open
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">Couldn&apos;t open the file.</span>}
    </span>
  );
}

export function ArchiveDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const [state, action] = useActionState(archiveDocument, initialActionState);
  return (
    <form action={action} className="grid justify-items-end"
      onSubmit={(ev) => { if (!window.confirm(`Remove ${fileName}? It is kept in the archive.`)) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Remove ${fileName}`}>Remove</SubmitButton>
      {state.status === "error" && <span role="alert" className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
