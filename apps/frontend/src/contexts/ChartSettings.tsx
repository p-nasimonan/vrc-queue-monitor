"use client";

import { createContext, useContext, useState } from "react";

interface ChartSettingsContextType {
  rangeHours: number;
  setRangeHours: (v: number) => void;
}

const ChartSettingsContext = createContext<ChartSettingsContextType>({
  rangeHours: 0,
  setRangeHours: () => {},
});

export function ChartSettingsProvider({ children }: { children: React.ReactNode }) {
  const [rangeHours, setRangeHours] = useState(0);

  return (
    <ChartSettingsContext.Provider value={{ rangeHours, setRangeHours }}>
      {children}
    </ChartSettingsContext.Provider>
  );
}

export const useChartSettings = () => useContext(ChartSettingsContext);
