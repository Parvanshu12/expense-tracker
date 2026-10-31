-- Who the user is (salaried, business, student, ...); see src/lib/user-types.ts.
ALTER TABLE users ADD COLUMN user_type TEXT;
