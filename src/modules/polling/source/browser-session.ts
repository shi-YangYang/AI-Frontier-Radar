import { chromium, type BrowserContext, type Page } from 'playwright';

export interface BrowserSessionOptions {
  headless?: boolean;
  proxyUrl?: string;
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const CDP_PLATFORM_BY_OS: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};
const CDP_ARCHITECTURE_BY_CPU: Record<string, string> = {
  arm64: 'arm',
  x64: 'x86',
};

export class BrowserSession {
  private readonly headless: boolean;
  private readonly proxyUrl?: string;
  private readonly userAgent: string;
  private queue: Promise<void> = Promise.resolve();

  public constructor(options: BrowserSessionOptions = {}) {
    this.headless = options.headless ?? true;
    this.proxyUrl = options.proxyUrl;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public withPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    return this.runExclusive(async () => {
      const browser = await chromium.launch({
        headless: this.headless,
        ...toLaunchProxyOption(this.proxyUrl),
      });
      const context = await browser.newContext({
        locale: 'en-US',
        userAgent: this.userAgent,
        viewport: { height: 1000, width: 1440 },
      });

      try {
        const page = await context.newPage();
        await applyHeadlessUserAgentMask(context, page, this.headless, this.userAgent);

        return await task(page);
      } finally {
        await browser.close().catch(() => undefined);
      }
    });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation = this.queue;
    let releaseCurrentOperation!: () => void;
    this.queue = new Promise((resolve) => {
      releaseCurrentOperation = resolve;
    });

    await previousOperation.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrentOperation();
    }
  }
}

function toLaunchProxyOption(proxyUrl: string | undefined): { proxy?: { server: string } } {
  if (proxyUrl === undefined || proxyUrl.trim().length === 0) {
    return {};
  }

  return { proxy: { server: proxyUrl } };
}

async function applyHeadlessUserAgentMask(
  context: BrowserContext,
  page: Page,
  enabled: boolean,
  maskedUserAgent: string,
): Promise<void> {
  if (!enabled) {
    return;
  }

  const version = context.browser()?.version() ?? '';
  const majorVersion = version.split('.')[0] || '0';
  const brands = [
    { brand: 'Chromium', version: majorVersion },
    { brand: 'Not.A/Brand', version: '8' },
  ];
  const fullVersionList =
    version.length === 0
      ? brands
      : [
          { brand: 'Chromium', version },
          { brand: 'Not.A/Brand', version: '8.0.0.0' },
        ];
  const platform = CDP_PLATFORM_BY_OS[process.platform] ?? 'Linux';
  const architecture = CDP_ARCHITECTURE_BY_CPU[process.arch] ?? '';
  const bitness = process.arch === 'x64' || process.arch === 'arm64' ? '64' : '';

  const client = await context.newCDPSession(page);
  await client.send('Emulation.setUserAgentOverride', {
    acceptLanguage: 'en-US,en',
    platform,
    userAgent: maskedUserAgent,
    userAgentMetadata: {
      architecture,
      bitness,
      brands,
      fullVersion: version,
      fullVersionList,
      mobile: false,
      model: '',
      platform,
      platformVersion: '',
      wow64: false,
    },
  });
}
