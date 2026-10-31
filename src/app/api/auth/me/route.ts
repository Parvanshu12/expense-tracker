import { NextResponse } from 'next/server';
import { handle } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth';
import { toProfile } from '@/lib/server/db';

export const GET = handle(async () => {
  const { user } = await requireUser();
  return NextResponse.json({ user: { ...toProfile(user), email: user.email } });
});
