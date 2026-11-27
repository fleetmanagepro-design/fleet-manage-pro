import { Badge } from "@/components/ui/badge";
import { formatCalendarDate, formatDate } from "@/lib/dates";
import { expiryItem } from "@/lib/expiry";
import type { PermissionSet } from "@/lib/permissions";
import { listDocuments } from "../queries";
import { DOC_TYPE_LABELS, type DocumentEntity, canAddDocuments, canArchiveDocuments, canViewDocuments } from "../rules";
import { ArchiveDocumentButton, OpenDocumentButton } from "./document-buttons";
import { DocumentUpload } from "./document-upload";

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Documents of one driver, truck or trailer: list (open, remove) and upload. */
export async function DocumentsSection({ organizationId, permissions, entity, entityId, timeZone, today, readOnly = false }: {
  organizationId: string; permissions: PermissionSet; entity: DocumentEntity; entityId: string; timeZone: string; today: string; readOnly?: boolean;
}) {
  if (!canViewDocuments(permissions, entity)) return null;
  const docs = await listDocuments(organizationId, entity, entityId);
  return (
    <div className="grid gap-4">
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {docs.map((d) => {
            const exp = d.expires_on ? expiryItem(d.id, "", d.expires_on, today) : null;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-testid={`document-${d.doc_type}`}>
                <div className="grid gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                    {exp?.state === "expired" && <Badge variant="destructive">Expired {formatCalendarDate(d.expires_on)}</Badge>}
                    {exp?.state === "due_soon" && <Badge variant="outline">Expires {formatCalendarDate(d.expires_on)}</Badge>}
                    {exp && exp.state !== "expired" && exp.state !== "due_soon" && (
                      <span className="text-xs font-normal text-muted-foreground">expires {formatCalendarDate(d.expires_on)}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{d.file_name} · {size(d.size_bytes)} · added {formatDate(d.uploaded_at, timeZone)}</span>
                  {d.notes && <span className="text-xs text-muted-foreground">{d.notes}</span>}
                </div>
                <div className="flex items-start gap-1">
                  <OpenDocumentButton id={d.id} fileName={d.file_name} />
                  {canArchiveDocuments(permissions, entity) && !readOnly && <ArchiveDocumentButton id={d.id} fileName={d.file_name} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canAddDocuments(permissions, entity) && !readOnly && (
        <div className="border-t pt-4">
          <DocumentUpload organizationId={organizationId} entity={entity} entityId={entityId} />
        </div>
      )}
    </div>
  );
}
