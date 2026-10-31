import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { newId, toCategory } from '@/lib/server/db';
import { categoryCreate } from '@/lib/server/schemas';

export const GET = handle(async () => {
  const { db, user } = await requireUser();
  const { results } = await db
    .prepare('SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY is_system DESC, rowid')
    .bind(user.id)
    .all();
  return NextResponse.json({ categories: results.map(toCategory) });
});

export const POST = handle(async (request: NextRequest) => {
  const { db, user } = await requireUser();
  const body = await parseBody(request, categoryCreate);
  const row = await db
    .prepare('INSERT INTO categories (id, user_id, name, category_type, icon, is_system) VALUES (?, ?, ?, ?, ?, 0) RETURNING *')
    .bind(newId(), user.id, body.name, body.category_type, body.icon)
    .first();
  return NextResponse.json({ category: toCategory(row!) }, { status: 201 });
});
