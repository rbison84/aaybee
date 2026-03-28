import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Movie } from '../types';

interface OpenMovieOptions {
  isOnWatchlist?: boolean;
}

interface MovieDetailContextType {
  selectedMovie: Movie | null;
  isVisible: boolean;
  initialWatchlistStatus: boolean | null;
  openMovieDetail: (movie: Movie, options?: OpenMovieOptions) => void;
  closeMovieDetail: () => void;
}

const MovieDetailContext = createContext<MovieDetailContextType | undefined>(undefined);

export function MovieDetailProvider({ children }: { children: ReactNode }) {
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [initialWatchlistStatus, setInitialWatchlistStatus] = useState<boolean | null>(null);

  const openMovieDetail = useCallback((movie: Movie, options?: OpenMovieOptions) => {
    setSelectedMovie(movie);
    setInitialWatchlistStatus(options?.isOnWatchlist ?? null);
    setIsVisible(true);
  }, []);

  const closeMovieDetail = useCallback(() => {
    setIsVisible(false);
    // Delay clearing movie data until animation completes
    setTimeout(() => {
      setSelectedMovie(null);
      setInitialWatchlistStatus(null);
    }, 300);
  }, []);

  return (
    <MovieDetailContext.Provider
      value={{
        selectedMovie,
        isVisible,
        initialWatchlistStatus,
        openMovieDetail,
        closeMovieDetail,
      }}
    >
      {children}
    </MovieDetailContext.Provider>
  );
}

export function useMovieDetail() {
  const context = useContext(MovieDetailContext);
  if (!context) {
    throw new Error('useMovieDetail must be used within a MovieDetailProvider');
  }
  return context;
}
