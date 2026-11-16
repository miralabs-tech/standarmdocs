import { createContext, useContext } from "react";
import { type Labels, LABELS } from "../core/labels";

export const LabelsContext = createContext<Labels>(LABELS.en);

export function useLabels(): Labels {
  return useContext(LabelsContext);
}
