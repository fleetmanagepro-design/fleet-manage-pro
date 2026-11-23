"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/client";
import { registerDocument } from "../actions";
import { DOC_TYPES, DOC_TYPE_LABELS, type DocumentEntity, documentPath, fileProblem } from "../rules";

type Props = { organizationId: string; entity: DocumentEntity; entityId: string };

/** Uploads the file straight to Storage (private bucket), then records the document. */
export function DocumentUpload({ organizationId, entity, entityId }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = (f: string) => `doc-${entity}-${f}`;

  return (
    <form ref={formRef} className="grid gap-3" noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        setError(null);
        setDone(null);
        const fd = new FormData(ev.currentTarget);
        const file = fd.get("file");
        if (!(file instanceof File) || file.size === 0) {
          setError("Choose a file.");
          return;
        }
        const problem = fileProblem(file);
        if (problem) {
          setError(problem);
          return;
        }
        startTransition(async () => {
          const documentId = crypto.randomUUID();
          const storagePath = documentPath(organizationId, entity, documentId, file.name);
          const { error: uploadError } = await createClient().storage.from("documents")
            .upload(storagePath, file, { contentType: file.type, upsert: false });
          if (uploadError) {
            console.error("document upload failed", uploadError);
            setError("The file couldn't be uploaded. Check your connection and try again.");
            return;
          }
          const result = await registerDocument({
            entityType: entity, entityId, documentId, storagePath, fileName: file.name,
            docType: fd.get("docType"), expiresOn: fd.get("expiresOn"), notes: fd.get("notes"),
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          formRef.current?.reset();
          setDone(`${file.name} added.`);
          router.refresh();
        });
      }}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {done && <p role="status" className="text-sm text-muted-foreground">{done}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]">
        <FormField id={id("file")} label="File (PDF, JPG or PNG, up to 20 MB)">
          <Input id={id("file")} name="file" type="file" accept="application/pdf,image/jpeg,image/png" />
        </FormField>
        <FormField id={id("type")} label="Document type">
          <NativeSelect id={id("type")} name="docType" defaultValue="" className="w-full">
            <NativeSelectOption value="">Choose…</NativeSelectOption>
            {DOC_TYPES[entity].map((t) => <NativeSelectOption key={t} value={t}>{DOC_TYPE_LABELS[t]}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id={id("expires")} name="expiresOn" label="Expires (optional)" type="date" />
      </div>
      <FormField id={id("notes")} name="notes" label="Notes (optional)" />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>{pending ? "Uploading…" : "Upload document"}</Button>
      </div>
    </form>
  );
}
