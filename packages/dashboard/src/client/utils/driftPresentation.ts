import type { DriftState } from "../../shared/types";

type DriftPresentation = {
  label: string;
  tone: "success" | "outline" | "warning" | "error";
  explanation: string;
  nextStep: string;
};

const presentations: Record<DriftState, DriftPresentation> = {
  new: {
    label: "Not created yet",
    tone: "outline",
    explanation: "There is no recorded base for this declaration, and the expected artifact is absent.",
    nextStep: "Inspect the destination and desired content before generating; preserve any existing file at that path.",
  },
  "in-sync": {
    label: "In sync",
    tone: "success",
    explanation: "The artifact on disk matches the current declaration.",
    nextStep: "No changes are needed.",
  },
  unmanaged: {
    label: "Existing, unmanaged",
    tone: "warning",
    explanation: "The path contains an artifact that is not recognized as the managed artifact for this declaration.",
    nextStep: "Inspect and save the existing content before deciding whether dotfiles should manage it.",
  },
  missing: {
    label: "Managed artifact missing",
    tone: "warning",
    explanation: "The previously recorded artifact is absent or has been replaced by a different kind of entry.",
    nextStep:
      "Inspect the destination for a replacement or intentional removal before restoring the declared artifact.",
  },
  "upstream-update": {
    label: "Declaration changed",
    tone: "outline",
    explanation: "The declaration changed while the local artifact still matches the recorded base.",
    nextStep: "Inspect the desired changes before generating the updated artifact.",
  },
  "local-drift": {
    label: "Local changes",
    tone: "warning",
    explanation: "The artifact on disk changed while the declaration still matches the recorded base.",
    nextStep: "Review and preserve local edits before changing the declaration or generating again.",
  },
  conflict: {
    label: "Conflict — decision needed",
    tone: "error",
    explanation: "Both the local artifact and the declaration changed differently from the recorded base.",
    nextStep: "Compare both sides and preserve local edits before choosing what to keep. Do not overwrite blindly.",
  },
};

export function driftPresentation(state: DriftState): DriftPresentation {
  return presentations[state];
}
