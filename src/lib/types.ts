export type TestStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "FINALIZED"
  | "IMPORTED";

export const STATUS_LABELS: Record<TestStatus, string> = {
  DRAFT: "Ciornă",
  IN_PROGRESS: "În lucru",
  VERIFIED: "Verificat",
  FINALIZED: "Finalizat",
  IMPORTED: "Importat",
};
