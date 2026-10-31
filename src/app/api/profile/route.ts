import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/lib/server/http';
import { requireUser, type UserRow } from '@/lib/server/auth';
import { nowIso, toProfile, updateSet } from '@/lib/server/db';
import { profileUpdate } from '@/lib/server/schemas';

export const GET = handle(async () => {
  const { user } = await requireUser();
  return NextResponse.json({ profile: toProfile(user) });
});

export const PATCH = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const changes = await parseBody(request, profileUpdate);
  const { sql, params } = updateSet({ ...changes, updated_at: nowIso() });
  const updated = await db
    .prepare(`UPDATE users SET ${sql} WHERE id = ? RETURNING *`)
    .bind(...params, user.id)
    .first<UserRow>();
  return NextResponse.json({ profile: toProfile(updated!) });
});
