const { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, readSync, rmSync, statSync } = require('node:fs');
const { basename, dirname, join, resolve } = require('node:path');

const DEFAULT_SQLITE_PATH = '.data/ai-news-monitor.sqlite';
const LOCAL_ENV_FILE_NAME = '.env';
const SQLITE_HEADER = 'SQLite format 3\0';

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const checkOnly = args.includes('--check');
  const backupFileArg = args.find((arg) => !arg.startsWith('--'));

  if (backupFileArg === undefined) {
    throw new Error('必须提供备份文件路径，例如 npm run db:restore -- .data/backups/backup-20260917-100000.sqlite');
  }

  const env = loadLocalEnv(process.cwd());
  const sqlitePath = resolve(process.cwd(), readEnvString(env, 'SQLITE_PATH', DEFAULT_SQLITE_PATH));
  const backupPath = resolve(process.cwd(), backupFileArg);

  step('检查备份文件');
  assertValidSqliteFile(backupPath);
  console.log(`  备份文件有效: ${backupPath} (${formatBytes(statSync(backupPath).size)})`);

  step('检查服务是否已停止');
  assertServiceStopped(env);

  if (checkOnly) {
    console.log('\n--check 模式：仅校验，不执行恢复。');
    return;
  }

  step('复制当前数据库为 pre-restore 快照');
  if (existsSync(sqlitePath)) {
    const snapshotDir = join(dirname(sqlitePath), 'backups');
    mkdirSync(snapshotDir, { recursive: true });
    const snapshotPath = join(snapshotDir, `pre-restore-${formatTimestamp(new Date())}.sqlite`);
    copyFileSync(sqlitePath, snapshotPath);
    console.log(`  已保存: ${snapshotPath}`);
  } else {
    console.log('  当前数据库不存在，跳过快照。');
  }

  step('恢复备份');
  copyFileSync(backupPath, sqlitePath);
  rmSync(`${sqlitePath}-wal`, { force: true });
  rmSync(`${sqlitePath}-shm`, { force: true });
  console.log(`  已恢复: ${basename(backupPath)} -> ${sqlitePath}`);

  console.log('\n完成。重新启动服务后生效：');
  console.log('  npm run local');
}

function printHelp() {
  console.log(`用法: npm run db:restore -- <备份文件> [--check]

用备份文件替换当前 SQLite 数据库（服务必须先停止）。

参数:
  <备份文件>   备份文件路径（.sqlite），来自管理台「数据库备份」或 .data/backups/
  --check      仅校验备份文件与服务状态，不执行恢复

行为:
  1. 校验备份文件为合法 SQLite 数据库
  2. 确认服务未在运行（HOST/PORT，默认 127.0.0.1:3000）
  3. 自动将当前数据库复制为 .data/backups/pre-restore-<时间戳>.sqlite
  4. 用备份替换当前数据库，并清理 -wal / -shm 文件`);
}

function step(title) {
  console.log(`\n== ${title} ==`);
}

function loadLocalEnv(cwd) {
  const envPath = resolve(cwd, LOCAL_ENV_FILE_NAME);

  if (!existsSync(envPath)) {
    return {};
  }

  const env = {};
  const content = readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(trimmed);

    if (match === null) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function readEnvString(env, name, fallback) {
  const value = process.env[name] ?? env[name];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function assertValidSqliteFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`备份文件不存在: ${filePath}`);
  }

  const header = Buffer.alloc(SQLITE_HEADER.length);
  const handle = openSync(filePath, 'r');

  try {
    const bytesRead = readSync(handle, header, 0, header.length, 0);

    if (bytesRead < header.length || header.toString('utf8', 0, header.length - 1) !== SQLITE_HEADER.slice(0, -1)) {
      throw new Error(`备份文件不是有效的 SQLite 数据库: ${filePath}`);
    }
  } finally {
    closeSync(handle);
  }
}

function assertServiceStopped(env) {
  const host = readEnvString(env, 'HOST', '127.0.0.1');
  const port = readEnvString(env, 'PORT', '3000');
  const url = `http://${host}:${port}/health`;
  const probe = probeUrl(url);

  if (probe) {
    throw new Error(`服务仍在运行（${url} 可访问）。请先停止服务再恢复数据库。`);
  }

  console.log(`  未检测到运行中的服务 (${url})`);
}

function probeUrl(url) {
  try {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const http=require('node:http');const req=http.get(${JSON.stringify(url)},(res)=>{res.resume();process.exit(0);});req.on('error',()=>process.exit(1));req.setTimeout(1200,()=>{req.destroy();process.exit(1);});`,
      ],
      { timeout: 3_000, stdio: 'ignore' },
    );

    return result.status === 0;
  } catch {
    return false;
  }
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

main();
