export interface RedisEndpoint {
  host: string;
  port: number;
  protocol: 'redis:' | 'rediss:';
}

export function parseRedisEndpoint(redisUrl: string): RedisEndpoint {
  const parsedUrl = new URL(redisUrl);

  if (parsedUrl.protocol !== 'redis:' && parsedUrl.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${parsedUrl.protocol}`);
  }

  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port.length > 0 ? Number.parseInt(parsedUrl.port, 10) : 6379,
    protocol: parsedUrl.protocol,
  };
}
