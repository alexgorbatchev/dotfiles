const ETA_VISIBILITY_DELAY_MS = 2_000;
const ACTIVE_ICON = "⏵";
const DEFAULT_LOCALE: Intl.LocalesArgument = "en-US";
const PROGRESS_FIELD_WIDTH = 40;
const ANSI_RESET = "\u001b[0m";
const ANSI_BLUE = "\u001b[34m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_DIM = "\u001b[2m";
const ANSI_BLACK_ON_WHITE = "\u001b[30;107m";
const ANSI_GRAY_ON_WHITE = "\u001b[90;107m";
const ANSI_YELLOW_ON_GRAY = "\u001b[33;100m";
const ANSI_WHITE_ON_GRAY = "\u001b[37;100m";
const ANSI_GRAY_BACKGROUND = "\u001b[100m";

export interface IProgressFrameState {
  filename: string;
  bytesDownloaded: number;
  totalBytes: number | null;
  elapsedMs: number;
  useAnsi?: boolean;
}

export function renderProgressFrame(state: IProgressFrameState): string {
  const useAnsi = state.useAnsi ?? false;
  const speedText = formatSpeed(state.bytesDownloaded, state.elapsedMs);
  const prefix = renderPrefix(state.filename, useAnsi);

  if (state.totalBytes === null) {
    const progressText = `[ ${formatBytes(state.bytesDownloaded)} ]`;
    return `${prefix} ${highlight(progressText, useAnsi)} ${speedText}`;
  }

  const transferredBytes = Math.min(state.bytesDownloaded, state.totalBytes);
  const percentage = state.totalBytes === 0 ? 0 : Math.min((transferredBytes / state.totalBytes) * 100, 100);
  const formattedPercentage = formatPercentage(percentage);
  const percentageText = formattedPercentage.padEnd(6, " ");
  const transferredText = formatBytes(transferredBytes);
  const totalText = formatBytes(state.totalBytes);
  const progressField = renderFancyProgressField({
    percentage,
    percentageText,
    transferredText,
    totalText,
    useAnsi,
  });
  const etaText = formatEta(state.bytesDownloaded, state.totalBytes, state.elapsedMs, useAnsi);

  return `${prefix} ${progressField} ${speedText}${etaText}`;
}

function highlight(text: string, useAnsi: boolean): string {
  if (!useAnsi) {
    return text;
  }

  return `${ANSI_BLACK_ON_WHITE}${text}${ANSI_RESET}`;
}

function renderPrefix(filename: string, useAnsi: boolean): string {
  if (!useAnsi) {
    return `${ACTIVE_ICON} ${filename}`;
  }

  return `${ANSI_BLUE}${ACTIVE_ICON}${ANSI_RESET} ${ANSI_BOLD}${filename}${ANSI_RESET}`;
}

interface IFancyProgressFieldOptions {
  percentage: number;
  percentageText: string;
  transferredText: string;
  totalText: string;
  useAnsi: boolean;
}

function renderFancyProgressField(options: IFancyProgressFieldOptions): string {
  const transferSummary = `(${options.transferredText}/${options.totalText})`;
  const progressFieldText = ` ${options.percentageText} ${transferSummary} `;
  const leftPad = " ".repeat(Math.floor((PROGRESS_FIELD_WIDTH - progressFieldText.length) / 2));
  const visibleFieldText = `${leftPad}${progressFieldText}`.padEnd(PROGRESS_FIELD_WIDTH, " ");

  if (!options.useAnsi) {
    return visibleFieldText.trimEnd();
  }

  const percentageStart = leftPad.length + 1;
  const percentageEnd = percentageStart + options.percentageText.length;
  const transferStart = percentageEnd + 1;
  const transferEnd = transferStart + transferSummary.length;
  const loadedChars = Math.floor(PROGRESS_FIELD_WIDTH * (options.percentage / 100));

  return renderStyledProgressField({
    visibleFieldText,
    loadedChars,
    percentageStart,
    percentageEnd,
    transferStart,
    transferEnd,
  });
}

interface IStyledProgressFieldOptions {
  visibleFieldText: string;
  loadedChars: number;
  percentageStart: number;
  percentageEnd: number;
  transferStart: number;
  transferEnd: number;
}

function renderStyledProgressField(options: IStyledProgressFieldOptions): string {
  let result = "";
  let activeStyle = "";

  for (let index = 0; index < options.visibleFieldText.length; index += 1) {
    const nextStyle = getProgressFieldStyle(index, options);

    if (nextStyle !== activeStyle) {
      if (activeStyle.length > 0) {
        result += ANSI_RESET;
      }

      result += nextStyle;
      activeStyle = nextStyle;
    }

    result += options.visibleFieldText[index];
  }

  return `${result}${ANSI_RESET}`;
}

function getProgressFieldStyle(index: number, options: IStyledProgressFieldOptions): string {
  const isLoaded = index < options.loadedChars;
  const isPercentage = index >= options.percentageStart && index < options.percentageEnd;
  const isTransferSummary = index >= options.transferStart && index < options.transferEnd;

  if (isLoaded && isTransferSummary) {
    return ANSI_GRAY_ON_WHITE;
  }

  if (isLoaded) {
    return ANSI_BLACK_ON_WHITE;
  }

  if (isPercentage) {
    return ANSI_YELLOW_ON_GRAY;
  }

  if (isTransferSummary) {
    return ANSI_WHITE_ON_GRAY;
  }

  return ANSI_GRAY_BACKGROUND;
}

function formatSpeed(bytesDownloaded: number, elapsedMs: number): string {
  if (elapsedMs <= 0) {
    return "0B/s";
  }

  return `${formatBytes(bytesDownloaded / (elapsedMs / 1_000))}/s`;
}

function formatEta(bytesDownloaded: number, totalBytes: number, elapsedMs: number, useAnsi: boolean): string {
  if (elapsedMs < ETA_VISIBILITY_DELAY_MS || bytesDownloaded <= 0 || bytesDownloaded >= totalBytes) {
    return "";
  }

  const remainingBytes = totalBytes - bytesDownloaded;
  const bytesPerMs = bytesDownloaded / elapsedMs;

  if (bytesPerMs <= 0) {
    return "";
  }

  const etaText = ` | ${formatDuration(Math.ceil(remainingBytes / bytesPerMs))} left`;
  return useAnsi ? `${ANSI_DIM}${etaText}${ANSI_RESET}` : etaText;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.ceil(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB", "TB"];

  if (bytes < 1000) {
    return `${bytes.toFixed(0)}B`;
  }

  let unitIndex = 0;
  let value = bytes;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  return `${value.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${units[unitIndex]}`;
}

function formatPercentage(percentage: number): string {
  return (
    percentage
      .toLocaleString(DEFAULT_LOCALE, {
        minimumIntegerDigits: 1,
        minimumFractionDigits: 4,
      })
      .slice(0, 5) + "%"
  );
}
