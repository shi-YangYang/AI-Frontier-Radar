import { BACKEND_MESSAGE_EN, BACKEND_PAGE_LABELS } from './backend-messages-dict';

type Replacer = (match: RegExpMatchArray) => string | null;

interface PatternRule {
  pattern: RegExp;
  replace: Replacer;
}

const RULES: PatternRule[] = [
  {
    pattern: /^尚未绑定微信账号，等待扫码（请在「设置 → 微信」中添加）$/u,
    replace: () => 'No WeChat account bound yet; waiting for QR scan (add one in Settings → WeChat).',
  },
  {
    pattern: /^尚未登录，等待扫码（请在「设置 → 微信」中登录；已等待约 (\d+) 秒）$/u,
    replace: (m) => `Not logged in yet; waiting for QR scan (Settings → WeChat, ~${m[1]}s elapsed).`,
  },
  {
    pattern: /^开始监听账号 (.+) 的会话$/u,
    replace: (m) => `Started watching conversations for account ${m[1]}`,
  },
  {
    pattern: /^账号 (.+) 监听失败（稍后重试）：(.+)$/u,
    replace: (m) => `Account ${m[1]} watch failed (will retry): ${m[2]}`,
  },
  {
    pattern: /^微信桥已启动：(.+)（POST \/send，GET \/health）$/u,
    replace: (m) => `WeChat bridge started: ${m[1]} (POST /send, GET /health)`,
  },
  {
    pattern: /^状态目录：(.+)$/u,
    replace: (m) => `State directory: ${m[1]}`,
  },
  {
    pattern: /^服务已启动，监听 (.+)$/u,
    replace: (m) => `Server listening at ${m[1]}`,
  },
  {
    pattern: /^抓取汇总 \| 账号 (\d+) 个 \| 成功 (\d+) 个 \| 失败 (\d+) 个 \| 新帖 (\d+) 条 \| 待发送 (\d+) 条$/u,
    replace: (m) =>
      `Polling summary | accounts ${m[1]} | succeeded ${m[2]} | failed ${m[3]} | new posts ${m[4]} | pending events ${m[5]}`,
  },
  {
    pattern: /^(.+?)(不存在|请求失败)（HTTP (\d+)）。$/u,
    replace: (m) => {
      const label = BACKEND_PAGE_LABELS[m[1] ?? ''];
      if (label === undefined) {
        return null;
      }
      const verb = m[2] === '不存在' ? 'was not found' : 'request failed';
      return `${label} ${verb} (HTTP ${m[3]}).`;
    },
  },
  {
    pattern: /^企业微信返回错误（errcode=(.+)）。$/u,
    replace: (m) => `WeCom webhook rejected the message (errcode=${m[1]}).`,
  },
  {
    pattern: /^钉钉返回错误（errcode=(.+)）。$/u,
    replace: (m) => `DingTalk webhook rejected the message (errcode=${m[1]}).`,
  },
  {
    pattern: /^Bark 返回错误（code=(.+)）。$/u,
    replace: (m) => `Bark rejected the notification (code=${m[1]}).`,
  },
  {
    pattern: /^通用 Webhook 返回 HTTP (.+)。$/u,
    replace: (m) => `Generic webhook returned HTTP ${m[1]}.`,
  },
  {
    pattern: /^通用 Webhook 已接收消息（HTTP (.+)）。$/u,
    replace: (m) => `Generic webhook accepted the message (HTTP ${m[1]}).`,
  },
  {
    pattern: /^微信桥返回失败：(.+)$/u,
    replace: (m) => `WeChat bridge returned an error: ${m[1]}`,
  },
  {
    pattern: /^微信桥请求失败（HTTP (.+)）。$/u,
    replace: (m) => `WeChat bridge request failed (HTTP ${m[1]}).`,
  },
  {
    pattern: /^全部账号发送失败：(.+)$/u,
    replace: (m) => `All accounts failed to send: ${m[1]}`,
  },
  {
    pattern: /^规则引用了不存在的通道：(.+)。$/u,
    replace: (m) => `Rule references unknown channels: ${m[1]}.`,
  },
  {
    pattern: /^不支持的渠道类型 (.+)。$/u,
    replace: (m) => `Unsupported channel type ${m[1]}.`,
  },
  {
    pattern: /^YouTube 频道页面请求失败（HTTP (\d+)）。$/u,
    replace: (m) => `YouTube channel page request failed (HTTP ${m[1]}).`,
  },
  {
    pattern: /^YouTube 频道页面请求失败：(.+)$/u,
    replace: (m) => `YouTube channel page request failed: ${m[1]}`,
  },
  {
    pattern: /^配置项 "(.+)" 必须是布尔值。$/u,
    replace: (m) => `App setting "${m[1]}" must be a boolean.`,
  },
  {
    pattern: /^配置项 "(.+)" 必须是字符串或 null。$/u,
    replace: (m) => `App setting "${m[1]}" must be a string or null.`,
  },
  {
    pattern: /^配置项 "(.+)" 必须是 (\d+)-(\d+) 的整数。$/u,
    replace: (m) => `App setting "${m[1]}" must be an integer from ${m[2]} to ${m[3]}.`,
  },
  {
    pattern: /^代理地址必须使用以下协议之一：(.+)。$/u,
    replace: (m) => `Proxy URL must use one of these protocols: ${m[1]}.`,
  },
  {
    pattern: /^保留天数必须是 0-(\d+) 的整数。$/u,
    replace: (m) => `retentionDays must be an integer from 0 to ${m[1]}.`,
  },
  {
    pattern: /^RSS 源 limit 必须是 (\d+)-(\d+) 的整数。$/u,
    replace: (m) => `RSS provider limit must be an integer between ${m[1]} and ${m[2]}.`,
  },
  {
    pattern: /^RSS 抓取失败（HTTP (\d+)）。$/u,
    replace: (m) => `RSS feed request failed with status ${m[1]}.`,
  },
  {
    pattern: /^未找到(.+)。$/u,
    replace: (m) => `${m[1]} was not found.`,
  },
  {
    pattern: /^主题包名称已存在：(.+)$/u,
    replace: (m) => `Source pack name already exists: ${m[1]}`,
  },
  {
    pattern: /^主题包不存在：(.+)$/u,
    replace: (m) => `Source pack was not found: ${m[1]}`,
  },
  {
    pattern: /^请求体必须是 JSON 对象。$/u,
    replace: () => 'Request body must be a JSON object.',
  },
  {
    pattern: /^分页参数必须是查询对象。$/u,
    replace: () => 'Pagination parameters must be a query object.',
  },
  {
    pattern: /^至少需要提供 (.+)。$/u,
    replace: (m) => `At least one of ${m[1]} is required.`,
  },
  {
    pattern: /^规则数量不能超过 (\d+) 条。$/u,
    replace: (m) => `At most ${m[1]} rules are allowed.`,
  },
  {
    pattern: /^该 webhook URL 已存在。$/u,
    replace: () => 'This webhook URL already exists.',
  },
  {
    pattern: /^管理页只允许从本机访问。$/u,
    replace: () => 'The admin console is only accessible from localhost.',
  },
  {
    pattern: /^管理前端尚未构建。请先运行 npm run build。$/u,
    replace: () => 'Admin UI is not built yet. Run npm run build first.',
  },
  {
    pattern: /^(.+) 必须是字符串。$/u,
    replace: (m) => `${m[1]} must be a string.`,
  },
  {
    pattern: /^(.+) 不能为空。$/u,
    replace: (m) => `${m[1]} must not be empty.`,
  },
  {
    pattern: /^(.+) 必须是布尔值。$/u,
    replace: (m) => `${m[1]} must be a boolean.`,
  },
  {
    pattern: /^(.+) 必须是整数。$/u,
    replace: (m) => `${m[1]} must be an integer.`,
  },
  {
    pattern: /^(.+) 必须是有效 URL。$/u,
    replace: (m) => `${m[1]} must be a valid URL.`,
  },
  {
    pattern: /^(.+) 必须是有效 ISO 时间字符串。$/u,
    replace: (m) => `${m[1]} must be a valid ISO timestamp.`,
  },
  {
    pattern: /^(.+) 必须是字符串数组。$/u,
    replace: (m) => `${m[1]} must be a string array.`,
  },
  {
    pattern: /^(.+) 必须是数组。$/u,
    replace: (m) => `${m[1]} must be an array.`,
  },
  {
    pattern: /^(.+) 必须是字符串或 null。$/u,
    replace: (m) => `${m[1]} must be a string or null.`,
  },
  {
    pattern: /^(.+) 必须是非负整数。$/u,
    replace: (m) => `${m[1]} must be a non-negative integer.`,
  },
  {
    pattern: /^(.+) 必须是 all、packs 或 custom。$/u,
    replace: (m) => `${m[1]} must be one of: all, packs, custom.`,
  },
  {
    pattern: /^(.+) 只能包含字符串。$/u,
    replace: (m) => `${m[1]} may only contain strings.`,
  },
  {
    pattern: /^(.+) 必须是正整数。$/u,
    replace: (m) => `${m[1]} must be a positive integer.`,
  },
  {
    pattern: /^(.+) 必须是单个字符串。$/u,
    replace: (m) => `${m[1]} must be a single string.`,
  },
  {
    pattern: /^(.+) 必须是单个正整数。$/u,
    replace: (m) => `${m[1]} must be a single positive integer.`,
  },
  {
    pattern: /^(.+) 必须是单个 ISO 时间字符串。$/u,
    replace: (m) => `${m[1]} must be a single ISO timestamp.`,
  },
  {
    pattern: /^(.+) 必须是单个筛选值。$/u,
    replace: (m) => `${m[1]} must be a single filter value.`,
  },
  {
    pattern: /^(.+) 必须是 all、true 或 false。$/u,
    replace: (m) => `${m[1]} must be one of: all, true, false.`,
  },
  {
    pattern: /^(.+) 不能超过 (\d+) 个字符。$/u,
    replace: (m) => `${m[1]} must be at most ${m[2]} characters.`,
  },
  {
    pattern: /^(.+) 不能超过 (\d+) 个词。$/u,
    replace: (m) => `${m[1]} must be at most ${m[2]} terms.`,
  },
  {
    pattern: /^(.+) 不能超过 (\d+) 个。$/u,
    replace: (m) => `${m[1]} must be at most ${m[2]}.`,
  },
  {
    pattern: /^(.+) 必须在 (\d+)-(\d+) 之间。$/u,
    replace: (m) => `${m[1]} must be between ${m[2]} and ${m[3]}.`,
  },
  {
    pattern: /^(.+) 中的词不能超过 (\d+) 个字符。$/u,
    replace: (m) => `Terms in ${m[1]} must be at most ${m[2]} characters.`,
  },
  {
    pattern: /^(.+) 必须是 any 或 all。$/u,
    replace: (m) => `${m[1]} must be any or all.`,
  },
  {
    pattern: /^(.+) 必须是 csv 或 json。$/u,
    replace: (m) => `${m[1]} must be csv or json.`,
  },
  {
    pattern: /^(.+) 必须是 debug、info、warn 或 error。$/u,
    replace: (m) => `${m[1]} must be debug, info, warn or error.`,
  },
  {
    pattern: /^开始时间不能晚于结束时间。$/u,
    replace: () => 'Start time must not be later than end time.',
  },
  {
    pattern: /^发布时间开始不能晚于结束时间。$/u,
    replace: () => 'Posted-from must not be later than posted-to.',
  },
  {
    pattern: /^检测时间开始不能晚于结束时间。$/u,
    replace: () => 'Detected-from must not be later than detected-to.',
  },
];

export function translateBackendMessageToEnglish(message: string): string {
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return message;
  }

  const exact = BACKEND_MESSAGE_EN[trimmed];

  if (exact !== undefined) {
    return exact;
  }

  for (const rule of RULES) {
    const match = trimmed.match(rule.pattern);

    if (match !== null) {
      const replaced = rule.replace(match);

      if (replaced !== null) {
        return replaced;
      }
    }
  }

  return message;
}
