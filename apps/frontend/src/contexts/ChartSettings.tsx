"use client";

import { createContext, useContext, useState } from "react";

interface ChartSettingsContextType {
  rangeHours: number;
  setRangeHours: (v: number) => void;
  /** 最新からいくつ前の窓か（0=最新、1=1窓前、...）*/
  offsetSteps: number;
  setOffsetSteps: (v: number) => void;
}

const ChartSettingsContext = createContext<ChartSettingsContextType>({
  rangeHours: 0,
  setRangeHours: () => {},
  offsetSteps: 0,
  setOffsetSteps: () => {},
});

export function ChartSettingsProvider({ children }: { children: React.ReactNode }) {
  const [rangeHours, setRangeHoursRaw] = useState(0);
  const [offsetSteps, setOffsetSteps] = useState(0);

  const setRangeHours = (v: number) => {
    setRangeHoursRaw(v);
    setOffsetSteps(0); // 範囲変更時は最新窓にリセット
  };

  return (
    <ChartSettingsContext.Provider value={{ rangeHours, setRangeHours, offsetSteps, setOffsetSteps }}>
      {children}
    </ChartSettingsContext.Provider>
  );
}

export const useChartSettings = () => useContext(ChartSettingsContext);
