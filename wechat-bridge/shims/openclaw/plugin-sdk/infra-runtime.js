import os from 'node:os';

const locks = new Map();

export function resolvePreferredOpenClawTmpDir() {
  const override = process.env.OPENCLAW_TMP_DIR?.trim();

  return override && override.length > 0 ? override : os.tmpdir();
}

export async function withFileLock(_filePath, optionsOrTask, maybeTask) {
  const task = typeof maybeTask === 'function' ? maybeTask : optionsOrTask;
  const previous = locks.get(_filePath) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  locks.set(
    _filePath,
    previous.then(() => current),
  );

  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    release();
  }
}
