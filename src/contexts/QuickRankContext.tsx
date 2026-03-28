import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface QuickRankMovie {
  id: string;
  title: string;
  year: number;
  posterUrl: string | null;
}

interface QuickRankContextType {
  isVisible: boolean;
  movie: QuickRankMovie | null;
  startQuickRank: (movie: QuickRankMovie) => void;
  closeQuickRank: () => void;
  onComplete: ((finalRank: number) => void) | null;
}

const QuickRankContext = createContext<QuickRankContextType | undefined>(undefined);

export function QuickRankProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [movie, setMovie] = useState<QuickRankMovie | null>(null);
  const [onComplete, setOnComplete] = useState<((finalRank: number) => void) | null>(null);

  const startQuickRank = useCallback((targetMovie: QuickRankMovie, completionCallback?: (finalRank: number) => void) => {
    setMovie(targetMovie);
    setOnComplete(() => completionCallback || null);
    setIsVisible(true);
  }, []);

  const closeQuickRank = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setMovie(null);
      setOnComplete(null);
    }, 300);
  }, []);

  return (
    <QuickRankContext.Provider
      value={{
        isVisible,
        movie,
        startQuickRank,
        closeQuickRank,
        onComplete,
      }}
    >
      {children}
    </QuickRankContext.Provider>
  );
}

export function useQuickRank() {
  const context = useContext(QuickRankContext);
  if (!context) {
    throw new Error('useQuickRank must be used within a QuickRankProvider');
  }
  return context;
}
