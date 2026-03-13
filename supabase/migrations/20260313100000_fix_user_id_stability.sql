-- Fix: NextAuth without DB adapter generates random UUIDs per sign-in,
-- causing user_id mismatch across devices. Migrate all user IDs to email.
-- Skip relay users (@relay.literati) — they use their own ID scheme.
-- Strategy: drop FK constraints, update references + IDs, re-add constraints.

-- Step 1: Temporarily drop FK constraints
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_user_id_fkey;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- Step 2: Point characters to the email-based user ID (skip relay users)
UPDATE characters c
SET user_id = u.email
FROM users u
WHERE c.user_id = u.id
  AND u.id != u.email
  AND u.email NOT LIKE '%@relay.literati';

-- Step 3: Point conversations to the email-based user ID (skip relay users)
UPDATE conversations c
SET user_id = u.email
FROM users u
WHERE c.user_id = u.id
  AND u.id != u.email
  AND u.email NOT LIKE '%@relay.literati';

-- Step 4: Update user IDs to email (skip relay users)
UPDATE users SET id = email
WHERE id != email AND email NOT LIKE '%@relay.literati';

-- Step 5: Re-add FK constraints
ALTER TABLE characters ADD CONSTRAINT characters_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
