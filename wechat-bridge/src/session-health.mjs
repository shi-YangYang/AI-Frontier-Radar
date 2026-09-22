// 微信平台作废会话时，HTTP 仍返回 200，作废信号只存在于响应体：errcode=-14（"session timeout"）。
export const SESSION_TIMEOUT_ERRCODE = -14;

export function isSessionInvalidated(response) {
  return (
    typeof response === 'object' &&
    response !== null &&
    response.errcode === SESSION_TIMEOUT_ERRCODE
  );
}
