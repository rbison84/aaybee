-- Backfill display_name in user_profiles from auth.users metadata
-- For users who signed up but never had their name written to user_profiles

UPDATE user_profiles
SET display_name = (
  SELECT raw_user_meta_data->>'display_name'
  FROM auth.users
  WHERE auth.users.id = user_profiles.id
)
WHERE display_name IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = user_profiles.id
      AND raw_user_meta_data->>'display_name' IS NOT NULL
  );
