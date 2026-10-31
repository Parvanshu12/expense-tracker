import { redirect } from 'next/navigation';

// Sign-in and sign-up share one email-first form.
export default function SignupPage() {
  redirect('/login');
}
