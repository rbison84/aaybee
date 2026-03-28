-- Aaybee Initial Movie Seed Data
-- Run this AFTER schema.sql and rls_policies.sql
-- 50 famous movies to start with

INSERT INTO movies (id, title, year, genres, poster_color, emoji) VALUES
-- Action/Sci-Fi
('tmdb-603', 'The Matrix', 1999, ARRAY['scifi', 'action'], '#0D0D0D', '🕶️'),
('tmdb-155', 'The Dark Knight', 2008, ARRAY['action', 'thriller'], '#1A1A2E', '🦇'),
('tmdb-157336', 'Interstellar', 2014, ARRAY['scifi', 'drama'], '#0A1628', '🌌'),
('tmdb-27205', 'Inception', 2010, ARRAY['scifi', 'action', 'thriller'], '#1A1A2E', '🌀'),
('tmdb-24428', 'The Avengers', 2012, ARRAY['action', 'scifi'], '#1E3A5F', '🦸'),
('tmdb-118340', 'Guardians of the Galaxy', 2014, ARRAY['action', 'scifi', 'comedy'], '#2D1B4E', '🚀'),
('tmdb-11', 'Star Wars: A New Hope', 1977, ARRAY['scifi', 'action', 'adventure'], '#000000', '⭐'),
('tmdb-1891', 'The Empire Strikes Back', 1980, ARRAY['scifi', 'action', 'adventure'], '#1A1A2E', '❄️'),
('tmdb-140607', 'Star Wars: The Force Awakens', 2015, ARRAY['scifi', 'action', 'adventure'], '#0D0D0D', '⚔️'),
('tmdb-299536', 'Avengers: Infinity War', 2018, ARRAY['action', 'scifi'], '#2D1B4E', '💎'),

-- Drama
('tmdb-278', 'The Shawshank Redemption', 1994, ARRAY['drama'], '#2C3E50', '🔓'),
('tmdb-238', 'The Godfather', 1972, ARRAY['drama', 'crime'], '#1A0A0A', '🎩'),
('tmdb-240', 'The Godfather Part II', 1974, ARRAY['drama', 'crime'], '#1A0A0A', '👨‍👦'),
('tmdb-550', 'Fight Club', 1999, ARRAY['drama', 'thriller'], '#8B0000', '🧼'),
('tmdb-13', 'Forrest Gump', 1994, ARRAY['drama', 'comedy', 'romance'], '#87CEEB', '🏃'),
('tmdb-489', 'Good Will Hunting', 1997, ARRAY['drama'], '#2E4A3F', '📚'),
('tmdb-807', 'Se7en', 1995, ARRAY['thriller', 'drama', 'crime'], '#1A1A1A', '📦'),

-- Comedy
('tmdb-120', 'The Lord of the Rings: Fellowship', 2001, ARRAY['fantasy', 'adventure', 'action'], '#2D4A1C', '💍'),
('tmdb-121', 'The Lord of the Rings: Two Towers', 2002, ARRAY['fantasy', 'adventure', 'action'], '#4A3B2A', '🗼'),
('tmdb-122', 'The Lord of the Rings: Return of the King', 2003, ARRAY['fantasy', 'adventure', 'action'], '#8B7355', '👑'),
('tmdb-862', 'Toy Story', 1995, ARRAY['animation', 'comedy', 'family'], '#87CEEB', '🤠'),
('tmdb-863', 'Toy Story 2', 1999, ARRAY['animation', 'comedy', 'family'], '#87CEEB', '🐴'),
('tmdb-10193', 'Toy Story 3', 2010, ARRAY['animation', 'comedy', 'family'], '#87CEEB', '🧸'),
('tmdb-585', 'Monsters, Inc.', 2001, ARRAY['animation', 'comedy', 'family'], '#4B9CD3', '👹'),
('tmdb-12', 'Finding Nemo', 2003, ARRAY['animation', 'comedy', 'family'], '#006994', '🐠'),
('tmdb-354912', 'Coco', 2017, ARRAY['animation', 'family', 'drama'], '#FF6B35', '🎸'),

-- Romance/Drama
('tmdb-597', 'Titanic', 1997, ARRAY['romance', 'drama'], '#1E3D59', '🚢'),
('tmdb-114', 'Pretty Woman', 1990, ARRAY['romance', 'comedy'], '#FF69B4', '👠'),
('tmdb-4348', 'Pride and Prejudice', 2005, ARRAY['romance', 'drama'], '#8B7355', '📖'),
('tmdb-313369', 'La La Land', 2016, ARRAY['romance', 'drama', 'comedy'], '#1A1A5E', '🌃'),
('tmdb-152601', 'Her', 2013, ARRAY['romance', 'drama', 'scifi'], '#FF6B6B', '💻'),
('tmdb-508', 'Love Actually', 2003, ARRAY['romance', 'comedy'], '#C41E3A', '❤️'),

-- Horror/Thriller
('tmdb-694', 'The Shining', 1980, ARRAY['horror', 'thriller'], '#8B0000', '🪓'),
('tmdb-539', 'Psycho', 1960, ARRAY['horror', 'thriller'], '#1A1A1A', '🔪'),
('tmdb-493922', 'Hereditary', 2018, ARRAY['horror', 'thriller'], '#1A1A1A', '👻'),
('tmdb-419430', 'Get Out', 2017, ARRAY['horror', 'thriller'], '#1A1A1A', '🫖'),
('tmdb-111', 'Scarface', 1983, ARRAY['crime', 'drama', 'thriller'], '#8B0000', '💰'),
('tmdb-680', 'Pulp Fiction', 1994, ARRAY['crime', 'thriller'], '#FFD700', '💼'),

-- Classic/Other
('tmdb-389', '12 Angry Men', 1957, ARRAY['drama'], '#4A4A4A', '⚖️'),
('tmdb-424', 'Schindler''s List', 1993, ARRAY['drama', 'history'], '#1A1A1A', '📜'),
('tmdb-497', 'The Green Mile', 1999, ARRAY['drama', 'fantasy'], '#2E4A3F', '⚡'),
('tmdb-637', 'Life Is Beautiful', 1997, ARRAY['drama', 'comedy', 'romance'], '#FFD700', '🌟'),
('tmdb-769', 'GoodFellas', 1990, ARRAY['crime', 'drama'], '#8B0000', '🔫'),
('tmdb-73', 'American History X', 1998, ARRAY['drama'], '#1A1A1A', '✊'),
('tmdb-311', 'Once Upon a Time in America', 1984, ARRAY['crime', 'drama'], '#8B7355', '🎭'),

-- Recent Hits
('tmdb-299534', 'Avengers: Endgame', 2019, ARRAY['action', 'scifi'], '#4B0082', '🧤'),
('tmdb-284054', 'Black Panther', 2018, ARRAY['action', 'scifi'], '#2D1B4E', '🐆'),
('tmdb-346698', 'Barbie', 2023, ARRAY['comedy', 'fantasy'], '#FF69B4', '👱‍♀️'),
('tmdb-872585', 'Oppenheimer', 2023, ARRAY['drama', 'history'], '#1A1A1A', '💣'),
('tmdb-502356', 'The Super Mario Bros. Movie', 2023, ARRAY['animation', 'comedy', 'family'], '#E60012', '🍄')

ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  year = EXCLUDED.year,
  genres = EXCLUDED.genres,
  poster_color = EXCLUDED.poster_color,
  emoji = EXCLUDED.emoji,
  updated_at = NOW();
