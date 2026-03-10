import { MAX_TELEGRAM_MESSAGE_LENGTH } from '../utils/constants.js';
import type { AgentResult } from '../agent/types.js';

export function formatAgentResult(
  result: AgentResult,
  maxLength: number = MAX_TELEGRAM_MESSAGE_LENGTH,
): string {
  const statusIcon = result.success ? 'Done' : 'Error';
  const meta = formatMeta(result);

  let body = result.result || (result.error ?? 'No output');
  const header = `${statusIcon} ${meta}\n\n`;
  const truncationSuffix = '\n...(truncated)';
  const availableLength = maxLength - header.length - truncationSuffix.length;

  if (body.length > availableLength) {
    body = body.slice(0, availableLength) + truncationSuffix;
  }

  return header + body;
}

export function formatMeta(result: AgentResult): string {
  const parts: string[] = [];
  if (result.durationMs > 0) {
    parts.push(`${formatDuration(result.durationMs)}`);
  }
  if (result.costUsd > 0) {
    parts.push(`$${result.costUsd.toFixed(2)}`);
  }
  if (result.numTurns > 0) {
    parts.push(`${result.numTurns} turns`);
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function splitLongMessage(
  text: string,
  maxLength: number = MAX_TELEGRAM_MESSAGE_LENGTH,
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline boundary
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex <= 0 || splitIndex < maxLength * 0.5) {
      // No good newline boundary, split at space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex <= 0 || splitIndex < maxLength * 0.5) {
      // No good split point, hard cut
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

export function escapeMarkdown(text: string): string {
  // Escape Telegram MarkdownV2 special characters
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function formatCostSummary(
  totalCost: number,
  taskCount: number,
): string {
  return `Total spent: $${totalCost.toFixed(2)} across ${taskCount} task${taskCount !== 1 ? 's' : ''}`;
}

export function formatElapsedTime(ms: number): string {
  return `Working on it... (${formatDuration(ms)} elapsed)`;
}
