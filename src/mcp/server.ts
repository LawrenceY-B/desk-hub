import { McpServer } from '@modelcontextprotocol/server';
import { getRaceResult, getRaceResultsAtCircuit } from '@/services/f1.service.js';
import { readF1Section, readSeasonCalendar } from '@/services/f1-read.service.js';
import type { F1ToolDeps } from '@/types/mcp.js';
import { registerF1Tools } from './tools/f1.js';

const INSTRUCTIONS = `Formula 1 data for Desk Hub: the next race and its weekend schedule, the latest result, championship standings, this season's calendar, and any race result since 1950.

- All times are UTC ISO strings. Convert them to the user's time zone when you know it, and say which zone you used.
- get_next_race, get_last_race_result and get_standings read the server's cache and are cheap; prefer them for anything about the current season.
- For an older race, find the round with get_season_calendar (this season) and call get_race_result, or use get_circuit_results with a circuit id. Don't guess round numbers.
- If a result's meta.stale is true, the data source was unreachable on the last refresh: say the figures may be out of date.
- Never invent results, times or points. If a tool returns nothing, say so.`;

const defaultDeps: F1ToolDeps = {
  readF1Section,
  readSeasonCalendar,
  getRaceResult,
  getRaceResultsAtCircuit,
  now: () => new Date(),
};

export function createServer(deps: F1ToolDeps = defaultDeps): McpServer {
  const server = new McpServer({ name: 'desk-hub', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  registerF1Tools(server, deps);
  return server;
}
