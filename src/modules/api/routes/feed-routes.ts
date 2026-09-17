import type { FastifyInstance } from 'fastify';

import type { StorageContext } from '../../storage';
import { readFeedQuery, renderJsonFeed, renderRssFeed } from '../controllers/feed-controller';

interface RegisterFeedRoutesOptions {
  storage: Pick<StorageContext, 'appSettings' | 'xPosts'>;
}

export function registerFeedRoutes(app: FastifyInstance, options: RegisterFeedRoutesOptions): void {
  app.get('/feed.xml', async (request, reply) => {
    const query = readFeedQuery(request.query);
    const body = await renderRssFeed(options.storage, {
      baseUrl: resolveBaseUrl(request.headers.host),
      query,
    });

    return reply
      .header('cache-control', 'no-store')
      .header('content-type', 'application/rss+xml; charset=utf-8')
      .send(body);
  });

  app.get('/feed.json', async (request, reply) => {
    const query = readFeedQuery(request.query);
    const body = await renderJsonFeed(options.storage, {
      baseUrl: resolveBaseUrl(request.headers.host),
      query,
    });

    return reply
      .header('cache-control', 'no-store')
      .header('content-type', 'application/feed+json; charset=utf-8')
      .send(body);
  });
}

function resolveBaseUrl(host: string | undefined): string {
  return host === undefined || host.length === 0 ? 'http://127.0.0.1:3000' : `http://${host}`;
}
