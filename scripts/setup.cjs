const { copyFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const MIN_NODE_MAJOR = 20;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--help') || args.has('-h')) {
    printHelp();
    return;
  }

  const dryRun = args.has('--dry-run');
  const skipInstall = args.has('--skip-install');
  const skipPlaywright = args.has('--skip-playwright');

  step('Checking Node.js version');
  checkNodeVersion();

  step('Preparing .env');
  ensureEnvFile(dryRun);

  if (!skipInstall) {
    step('Installing npm dependencies');
    runNpm(
      [
        'install',
        '--cache',
        './.npm-cache',
        '--prefer-online',
        '--offline=false',
        '--registry',
        process.env.NPM_REGISTRY || process.env.npm_config_registry || DEFAULT_REGISTRY,
      ],
      dryRun,
    );
  }

  step('Generating Prisma Client');
  runNpm(['run', 'prisma:generate'], dryRun);

  step('Applying SQLite migrations');
  runNpm(['run', 'prisma:migrate:deploy'], dryRun);

  if (!skipPlaywright) {
    step('Installing Playwright Chromium');
    runNpm(['run', 'playwright:install'], dryRun);
  }

  done();
}

function printHelp() {
  process.stdout.write(`AI Frontier Radar setup

Usage:
  npm run setup
  node scripts/setup.cjs [--dry-run] [--skip-install] [--skip-playwright]

Environment:
  NPM_REGISTRY  Override npm registry for dependency installation.

Rules:
  - Existing .env is never overwritten.
  - Any failed command stops the setup immediately.
  - Secrets are never printed.
`);
}

function step(message) {
  process.stdout.write(`\n[setup] ${message}\n`);
}

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);

  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    fail(`Node.js >= ${MIN_NODE_MAJOR} is required. Current version: ${process.version}`);
  }

  process.stdout.write(`[setup] Node.js ${process.version} OK\n`);
}

function ensureEnvFile(dryRun) {
  const envPath = resolve(process.cwd(), '.env');
  const examplePath = resolve(process.cwd(), '.env.example');

  if (existsSync(envPath)) {
    process.stdout.write('[setup] .env already exists; keeping it unchanged.\n');
    return;
  }

  if (!existsSync(examplePath)) {
    fail('.env.example was not found; cannot create .env.');
  }

  if (dryRun) {
    process.stdout.write('[setup] dry-run: would create .env from .env.example.\n');
    return;
  }

  copyFileSync(examplePath, envPath);
  process.stdout.write('[setup] Created .env from .env.example. Edit it later if you need real webhook/proxy values.\n');
}

function runNpm(args, dryRun) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const printable = ['npm', ...args].join(' ');

  if (dryRun) {
    process.stdout.write(`[setup] dry-run: would run ${printable}\n`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    fail(`Command failed to start: ${printable}\nReason: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`Command failed with exit code ${result.status}: ${printable}`);
  }
}

function done() {
  process.stdout.write(`
[setup] Initialization completed.

Next:
  npm run local

Then open:
  http://127.0.0.1:3000/

Configure Feishu webhooks, watched X accounts, and X source/proxy in the local Web UI.
`);
}

function fail(message) {
  process.stderr.write(`\n[setup] ${message}\n`);
  process.stderr.write('[setup] Setup stopped. Fix the error above, then run npm run setup again.\n');
  process.exit(1);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
