import type { ProgressEvent } from './types.js';
import { formatDuration } from '../telegram/formatter.js';

/**
 * Format accumulated progress events into a compact status line.
 * Example: "Working... | Read(3) Edit(1) Bash(2) | 45s"
 */
export function formatProgressCompact(
  events: ProgressEvent[],
  elapsedMs: number,
): string {
  const elapsed = formatDuration(elapsedMs);

  if (events.length === 0) {
    return `Working on it... (${elapsed} elapsed)`;
  }

  // Count tool usage
  const toolCounts = new Map<string, number>();
  for (const event of events) {
    if (event.type === 'tool_start' && event.toolName) {
      const name = event.toolName;
      toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
    }
  }

  if (toolCounts.size === 0) {
    return `Working on it... (${elapsed} elapsed)`;
  }

  const toolSummary = [...toolCounts.entries()]
    .map(([name, count]) => (count > 1 ? `${name}(${count})` : name))
    .join(' ');

  return `Working... | ${toolSummary} | ${elapsed}`;
}

export type VerbosityLevel = 0 | 1 | 2;

/**
 * Format a single progress event for display.
 * Returns null if the event should not be shown at the given verbosity.
 */
export function formatProgressEvent(
  event: ProgressEvent,
  verbosity: VerbosityLevel,
): string | null {
  if (verbosity === 0) return null;

  if (verbosity >= 1 && event.type === 'tool_start') {
    const input = event.toolInput
      ? `: ${event.toolInput.slice(0, 100)}`
      : '';
    return `Using ${event.toolName}${input}`;
  }

  if (verbosity >= 2 && event.type === 'assistant_reply') {
    return event.text?.slice(0, 200) ?? null;
  }

  if (verbosity >= 2 && event.type === 'assistant_thinking') {
    return event.text ? `Thinking: ${event.text.slice(0, 150)}` : null;
  }

  return null;
}
