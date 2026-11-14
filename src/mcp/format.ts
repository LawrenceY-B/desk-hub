import type { ToolResult } from '@/types/mcp.js';
import { RateLimitError } from '@/utils/errors.js';

// Compact JSON: indentation only costs the model tokens.
export const json = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});

export const errorResult = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

export async function safely(tool: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mcp] ${tool} failed: ${message}`);
    if (err instanceof RateLimitError) {
      return errorResult(
        `The F1 data source is rate limiting requests until ${err.retryAt.toISOString()}. ` +
          'Try again after that. get_next_race, get_last_race_result and get_standings read from the cache and may still work.',
      );
    }
    return errorResult(`Could not load F1 data: ${message}. Try again in a minute.`);
  }
}
