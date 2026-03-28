-- Fuzzy search function using pg_trgm similarity + ilike fallback
-- Requires pg_trgm extension (already enabled in 20260215_tier5_trigram_search.sql)

CREATE OR REPLACE FUNCTION search_movies_fuzzy(search_query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  id TEXT, tmdb_id INT, title TEXT, year INT, genres TEXT[],
  poster_url TEXT, poster_path TEXT, poster_color TEXT,
  overview TEXT, vote_count INT, vote_average NUMERIC,
  tier INT, collection_id INT, collection_name TEXT,
  director_name TEXT, director_id INT, certification TEXT,
  original_language TEXT
) LANGUAGE sql STABLE AS $$
  SELECT m.id, m.tmdb_id, m.title, m.year, m.genres,
         m.poster_url, m.poster_path, m.poster_color,
         m.overview, m.vote_count, m.vote_average,
         m.tier, m.collection_id, m.collection_name,
         m.director_name, m.director_id, m.certification,
         m.original_language
  FROM movies m
  WHERE similarity(m.title, search_query) > 0.1
     OR m.title ILIKE '%' || search_query || '%'
  ORDER BY similarity(m.title, search_query) DESC, m.vote_count DESC
  LIMIT result_limit;
$$;
