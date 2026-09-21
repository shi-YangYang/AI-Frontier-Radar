// The upstream login helper reads verification codes from process.stdin.
// One short-lived process per QR keeps both its prompts and input isolated.
import QRCode from 'qrcode';

let events = Promise.resolve();
let finished = false;
const send = (message) => process.send?.(message);
const enqueue = (task) => { events = events.then(task); };

process.stdout.write = (chunk, encoding, callback) => {
  const text = String(chunk);
  if (text.includes('输入手机微信显示的数字') || text.includes('请重新输入')) {
    enqueue(() => send({ status: 'need-code', message: '请输入手机微信上显示的数字。' }));
  } else if (text.includes('正在验证')) {
    enqueue(() => send({ status: 'scanned', message: '已扫码，等待微信确认…' }));
  } else if (/^https?:\/\/\S+$/u.test(text.trim())) {
    // The upstream helper prints the replacement URL when a QR expires.
    enqueue(() => sendQr(text.trim()));
  }
  const done = typeof encoding === 'function' ? encoding : callback;
  done?.();
  return true;
};

async function sendQr(qrcodeUrl) {
  const qrcodeDataUrl = await QRCode.toDataURL(qrcodeUrl, { margin: 1, width: 260 });
  if (!finished) send({ status: 'pending', qrcodeUrl, qrcodeDataUrl, message: '请使用手机微信扫码，并在微信中确认。' });
}

async function main() {
  const login = await import('@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js');
  const started = await login.startWeixinLoginWithQr({ force: true });
  if (!started.qrcodeUrl) throw new Error(started.message ?? '获取二维码失败。');
  await sendQr(started.qrcodeUrl);
  const result = await login.waitForWeixinLogin({ sessionKey: started.sessionKey, timeoutMs: 480_000 });
  await events;
  finished = true;
  send({ type: 'result', result });
}

process.on('disconnect', () => process.exit());
main().catch((error) => {
  finished = true;
  send({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
});
