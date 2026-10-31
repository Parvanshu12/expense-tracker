import 'server-only';
import type { ImportJob } from '@/types/entry';

export function toImportJob(row: Record<string, unknown>): ImportJob {
  return {
    id: row.id as string,
    filename: row.filename as string,
    status: row.status as ImportJob['status'],
    total_pages: Number(row.total_pages),
    pages_done: Number(row.pages_done),
    found: Number(row.found),
    added: Number(row.added),
    skipped: Number(row.skipped),
    needs_review: Number(row.needs_review),
    events: JSON.parse((row.events as string) || '[]'),
    skipped_rows: JSON.parse((row.skipped_rows as string) || '[]'),
    error: (row.error as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
