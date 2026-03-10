#!/usr/bin/env node

import 'dotenv/config';
import { DEFAULT_CONFIG_PATH, APP_NAME, APP_VERSION } from './utils/constants.js';

const args = process.argv.slice(2);
const command = args[0];

if (args.includes('--help') || args.includes('-h')) {
  console.log(`${APP_NAME} v${APP_VERSION}\n`);
  console.log('Usage: hyphora [command] [options]\n');
  console.log('Commands:');
  console.log('  init                 Interactive setup wizard');
  console.log('  start (default)      Start the daemon\n');
  console.log('Options:');
  console.log('  --config, -c <path>  Path to soul.yaml config file (default: ./soul.yaml)');
  console.log('  --version, -v        Show version');
  console.log('  --help, -h           Show this help');
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`${APP_NAME} v${APP_VERSION}`);
  process.exit(0);
}

if (command === 'init') {
  const { runInit } = await import('./cli.js');
  await runInit();
  process.exit(0);
}

// Default: start daemon
// Parse config path
let configPath = DEFAULT_CONFIG_PATH;
const configIndex = args.findIndex((a) => a === '--config' || a === '-c');
if (configIndex !== -1 && args[configIndex + 1]) {
  configPath = args[configIndex + 1];
}

const { startDaemon } = await import('./daemon.js');
startDaemon(configPath).catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
