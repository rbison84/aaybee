import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DevSettings {
  showSelectionLogic: boolean;
  toggleSelectionLogic: () => void;
  unlockAllFeatures: boolean;
  toggleUnlockAllFeatures: () => void;
}

const DevSettingsContext = createContext<DevSettings>({
  showSelectionLogic: false,
  toggleSelectionLogic: () => {},
  unlockAllFeatures: false,
  toggleUnlockAllFeatures: () => {},
});

const STORAGE_KEY = '@aaybee/dev_show_selection_logic';
const UNLOCK_KEY = '@aaybee/dev_unlock_all_features';

export function DevSettingsProvider({ children }: { children: ReactNode }) {
  const [showSelectionLogic, setShowSelectionLogic] = useState(false);
  const [unlockAllFeatures, setUnlockAllFeatures] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (value === 'true') setShowSelectionLogic(true);
    });
    AsyncStorage.getItem(UNLOCK_KEY).then(value => {
      if (value === 'true') setUnlockAllFeatures(true);
    });
  }, []);

  const toggleSelectionLogic = useCallback(() => {
    setShowSelectionLogic(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      return next;
    });
  }, []);

  const toggleUnlockAllFeatures = useCallback(() => {
    setUnlockAllFeatures(prev => {
      const next = !prev;
      AsyncStorage.setItem(UNLOCK_KEY, next ? 'true' : 'false');
      return next;
    });
  }, []);

  return (
    <DevSettingsContext.Provider value={{ showSelectionLogic, toggleSelectionLogic, unlockAllFeatures, toggleUnlockAllFeatures }}>
      {children}
    </DevSettingsContext.Provider>
  );
}

export function useDevSettings() {
  return useContext(DevSettingsContext);
}
