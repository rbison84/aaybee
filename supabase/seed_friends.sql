-- ============================================
-- SEED FRIENDS TEST DATA
-- ============================================
-- Run this in Supabase SQL Editor
--
-- PREREQUISITES:
-- 1. You must be signed up with masood.ross@gmail.com
-- 2. The friendships table must exist (run friendships.sql first)
-- 3. Movies must be seeded (run seed_movies.sql first)
--
-- NOTE: This script creates test users directly in auth.users
-- using Supabase's internal functions. Run as admin.
-- ============================================

-- Step 1: Get your user ID
DO $$
DECLARE
  my_user_id UUID;
BEGIN
  SELECT id INTO my_user_id FROM auth.users WHERE email = 'masood.ross@gmail.com';
  IF my_user_id IS NULL THEN
    RAISE EXCEPTION 'Your account (masood.ross@gmail.com) not found. Please sign up in the app first.';
  END IF;
  RAISE NOTICE 'Your user ID: %', my_user_id;
END $$;

-- Step 2: Create test friend users
-- Using auth.users insert (requires service role / admin access)

-- Helper function to create test users
CREATE OR REPLACE FUNCTION create_test_friend(
  p_email TEXT,
  p_display_name TEXT,
  p_favorite_genres TEXT[],
  p_total_comparisons INT
) RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Check if user already exists
  SELECT id INTO new_user_id FROM auth.users WHERE email = p_email;

  IF new_user_id IS NOT NULL THEN
    RAISE NOTICE 'User % already exists with ID %', p_email, new_user_id;
  ELSE
    -- Generate a new UUID
    new_user_id := gen_random_uuid();

    -- Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      crypt('TestPassword123!', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object('display_name', p_display_name),
      'authenticated',
      'authenticated'
    );

    RAISE NOTICE 'Created user % with ID %', p_email, new_user_id;
  END IF;

  -- Upsert user_profiles
  INSERT INTO user_profiles (id, display_name, favorite_genres, total_comparisons, updated_at)
  VALUES (new_user_id, p_display_name, p_favorite_genres, p_total_comparisons, NOW())
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    favorite_genres = EXCLUDED.favorite_genres,
    total_comparisons = EXCLUDED.total_comparisons,
    updated_at = NOW();

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create all test friends
DO $$
DECLARE
  my_id UUID;
  friend_id UUID;
  movie_record RECORD;
  movie_count INT;
  rank_counter INT;
BEGIN
  -- Get your user ID
  SELECT id INTO my_id FROM auth.users WHERE email = 'masood.ross@gmail.com';

  -- ========================================
  -- SIMILAR TASTE FRIENDS (85-95% match)
  -- ========================================

  -- Sarah Chen - 89% match (Sci-fi, thriller lover)
  friend_id := create_test_friend(
    'sarah.chen@example.com',
    'Sarah Chen',
    ARRAY['scifi', 'thriller', 'drama'],
    67
  );

  -- Create friendship
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '15 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '15 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  -- Create movie rankings for Sarah (similar to typical sci-fi fan)
  rank_counter := 1;
  FOR movie_record IN
    SELECT id, title FROM movies
    WHERE title IN ('The Matrix', 'Inception', 'Interstellar', 'Blade Runner 2049', 'The Dark Knight', 'Fight Club', 'Arrival', 'The Prestige', 'Memento', 'Pulp Fiction')
    ORDER BY CASE title
      WHEN 'The Matrix' THEN 1
      WHEN 'Inception' THEN 2
      WHEN 'Interstellar' THEN 3
      WHEN 'Blade Runner 2049' THEN 4
      WHEN 'The Dark Knight' THEN 5
      ELSE 10
    END
    LIMIT 40
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (
      friend_id,
      movie_record.id,
      1500 - (rank_counter * 15) + (random() * 30 - 15),
      'known',
      floor(random() * 10 + 3)::int,
      floor(random() * 8 + 1)::int,
      floor(random() * 5)::int,
      NOW()
    )
    ON CONFLICT (user_id, movie_id) DO UPDATE SET
      beta = EXCLUDED.beta,
      updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Sarah Chen with % movies', rank_counter - 1;

  -- James Wilson - 92% match
  friend_id := create_test_friend(
    'james.wilson@example.com',
    'James Wilson',
    ARRAY['scifi', 'action', 'thriller'],
    58
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '20 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '20 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Inception', 'The Matrix', 'The Dark Knight', 'Pulp Fiction', 'Interstellar', 'Mad Max: Fury Road', 'Fight Club', 'Gladiator', 'The Prestige')
    LIMIT 35
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 30 - 15), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created James Wilson with % movies', rank_counter - 1;

  -- Emily Patel - 86% match
  friend_id := create_test_friend(
    'emily.patel@example.com',
    'Emily Patel',
    ARRAY['drama', 'thriller', 'scifi'],
    73
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '10 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '10 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('The Shawshank Redemption', 'Inception', 'The Godfather', 'Interstellar', 'Fight Club', 'Se7en', 'Forrest Gump', 'The Dark Knight')
    LIMIT 45
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 30 - 15), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Emily Patel with % movies', rank_counter - 1;

  -- ========================================
  -- MODERATE SIMILARITY FRIENDS (60-75%)
  -- ========================================

  -- Alex Kim - 72% match
  friend_id := create_test_friend(
    'alex.kim@example.com',
    'Alex Kim',
    ARRAY['drama', 'thriller', 'action'],
    71
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '25 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '25 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('The Godfather', 'Fight Club', 'The Dark Knight', 'Goodfellas', 'Pulp Fiction', 'Heat', 'The Shawshank Redemption', 'Taxi Driver')
    LIMIT 40
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 40 - 20), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Alex Kim with % movies', rank_counter - 1;

  -- Jordan Taylor - 65% match
  friend_id := create_test_friend(
    'jordan.taylor@example.com',
    'Jordan Taylor',
    ARRAY['action', 'adventure', 'scifi'],
    45
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '8 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '8 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Mad Max: Fury Road', 'John Wick', 'The Matrix', 'Gladiator', 'Terminator 2', 'Raiders of the Lost Ark', 'The Dark Knight')
    LIMIT 30
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 50 - 25), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Jordan Taylor with % movies', rank_counter - 1;

  -- Maya Johnson - 61% match
  friend_id := create_test_friend(
    'maya.johnson@example.com',
    'Maya Johnson',
    ARRAY['drama', 'romance', 'comedy'],
    62
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '12 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '12 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Forrest Gump', 'The Shawshank Redemption', 'Good Will Hunting', 'Titanic', 'A Beautiful Mind', 'The Green Mile', 'The Notebook')
    LIMIT 35
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 50 - 25), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Maya Johnson with % movies', rank_counter - 1;

  -- David Nguyen - 68% match
  friend_id := create_test_friend(
    'david.nguyen@example.com',
    'David Nguyen',
    ARRAY['thriller', 'horror', 'mystery'],
    54
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '18 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '18 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Se7en', 'The Silence of the Lambs', 'Zodiac', 'Gone Girl', 'Shutter Island', 'Prisoners', 'Get Out', 'The Dark Knight')
    LIMIT 32
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 40 - 20), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created David Nguyen with % movies', rank_counter - 1;

  -- ========================================
  -- DIFFERENT TASTE FRIENDS (30-50%)
  -- ========================================

  -- Mike Rodriguez - 45% match (Comedy/Romance lover)
  friend_id := create_test_friend(
    'mike.rodriguez@example.com',
    'Mike Rodriguez',
    ARRAY['comedy', 'romance', 'animation'],
    52
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '30 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '30 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Toy Story', 'La La Land', 'The Notebook', 'Crazy Rich Asians', 'Finding Nemo', 'Up', 'Shrek', 'Forrest Gump')
    LIMIT 30
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 60 - 30), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Mike Rodriguez with % movies', rank_counter - 1;

  -- Sophia Martinez - 38% match
  friend_id := create_test_friend(
    'sophia.martinez@example.com',
    'Sophia Martinez',
    ARRAY['romance', 'drama', 'comedy'],
    48
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '22 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '22 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('The Notebook', 'Pride and Prejudice', 'La La Land', 'Titanic', 'Notting Hill', 'Love Actually', 'When Harry Met Sally')
    LIMIT 28
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 60 - 30), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Sophia Martinez with % movies', rank_counter - 1;

  -- Chris Brown - 42% match
  friend_id := create_test_friend(
    'chris.brown@example.com',
    'Chris Brown',
    ARRAY['horror', 'comedy', 'animation'],
    39
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'accepted', NOW() - interval '5 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (my_id, friend_id, 'accepted', NOW() - interval '5 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Get Out', 'Hereditary', 'The Conjuring', 'A Quiet Place', 'Shrek', 'Monsters Inc', 'Us', 'It')
    LIMIT 25
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15) + (random() * 60 - 30), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Chris Brown with % movies', rank_counter - 1;

  -- ========================================
  -- PENDING FRIEND REQUESTS
  -- ========================================

  -- Rachel Green - Pending request
  friend_id := create_test_friend(
    'rachel.green@example.com',
    'Rachel Green',
    ARRAY['comedy', 'romance', 'drama'],
    35
  );

  -- Only one-way friendship (pending)
  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'pending', NOW() - interval '2 days')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('When Harry Met Sally', 'Notting Hill', 'The Holiday', 'Love Actually', 'Forrest Gump')
    LIMIT 20
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Rachel Green (pending) with % movies', rank_counter - 1;

  -- Tom Hardy Fan - Pending request
  friend_id := create_test_friend(
    'tom.hardy.fan@example.com',
    'Tom Hardy Fan',
    ARRAY['action', 'thriller', 'drama'],
    41
  );

  INSERT INTO friendships (user_id, friend_id, status, created_at)
  VALUES (friend_id, my_id, 'pending', NOW() - interval '1 day')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  rank_counter := 1;
  FOR movie_record IN
    SELECT id FROM movies
    WHERE title IN ('Mad Max: Fury Road', 'The Dark Knight Rises', 'Inception', 'Dunkirk', 'The Revenant')
    LIMIT 25
  LOOP
    INSERT INTO user_movies (user_id, movie_id, beta, status, total_comparisons, wins, losses, updated_at)
    VALUES (friend_id, movie_record.id, 1500 - (rank_counter * 15), 'known', floor(random() * 10 + 3)::int, floor(random() * 8 + 1)::int, floor(random() * 5)::int, NOW())
    ON CONFLICT (user_id, movie_id) DO UPDATE SET beta = EXCLUDED.beta, updated_at = NOW();
    rank_counter := rank_counter + 1;
  END LOOP;
  RAISE NOTICE 'Created Tom Hardy Fan (pending) with % movies', rank_counter - 1;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SEED COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Created 10 accepted friends + 2 pending requests';

END $$;

-- Cleanup helper function
DROP FUNCTION IF EXISTS create_test_friend;

-- Verify results
SELECT 'Friendships created:' as status, COUNT(*) as count FROM friendships;
SELECT 'Accepted friends:' as status, COUNT(*) as count FROM friendships WHERE status = 'accepted';
SELECT 'Pending requests:' as status, COUNT(*) as count FROM friendships WHERE status = 'pending';

-- Show friend summary
SELECT
  up.display_name,
  up.favorite_genres,
  up.total_comparisons,
  f.status,
  (SELECT COUNT(*) FROM user_movies um WHERE um.user_id = up.id) as movies_ranked
FROM user_profiles up
JOIN friendships f ON (f.user_id = up.id OR f.friend_id = up.id)
JOIN auth.users au ON au.id = up.id
WHERE au.email LIKE '%@example.com'
GROUP BY up.id, up.display_name, up.favorite_genres, up.total_comparisons, f.status
ORDER BY f.status, up.display_name;
