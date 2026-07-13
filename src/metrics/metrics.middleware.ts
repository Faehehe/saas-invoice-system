import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Counter } from 'prom-client';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private histogram: Histogram<string>,
    @InjectMetric('http_requests_total')
    private counter: Counter<string>,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const method = req.method;
      // req.route is populated by the time 'finish' fires.
      // Fall back to originalUrl only if no route matched (e.g. 404).
      const route = req.route?.path || req.baseUrl || 'unknown';
      const statusCode = res.statusCode;
      const duration = (Date.now() - start) / 1000;

      const labels = { method, route, status_code: String(statusCode) };
      this.histogram.observe(labels, duration);
      this.counter.inc(labels);
    });

    next();
  }
}