-- Goals chosen at onboarding (JSON array of ids from src/lib/main-goals.ts).
ALTER TABLE users ADD COLUMN main_goals TEXT NOT NULL DEFAULT '[]';
