-- Fix: NextAuth without DB adapter generates random UUIDs per sign-in,
-- causing user_id mismatch across devices. Migrate all user IDs to email.

-- Step 1: For users whose id != email, create/update a row with id=email
INSERT INTO users (id, email, name, image, created_at)
SELECT email, email, name, image, created_at
FROM users
WHERE id != email
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  image = EXCLUDED.image;

-- Step 2: Point characters to the email-based user ID
UPDATE characters c
SET user_id = u.email
FROM users u
WHERE c.user_id = u.id
  AND u.id != u.email;

-- Step 3: Point conversations to the email-based user ID
UPDATE conversations c
SET user_id = u.email
FROM users u
WHERE c.user_id = u.id
  AND u.id != u.email;

-- Step 4: Delete old user rows with random IDs (FKs already updated)
DELETE FROM users WHERE id != email;
