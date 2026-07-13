import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Counter } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private histogram: Histogram<string>,
    @InjectMetric('http_requests_total')
    private counter: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    // Use the route pattern (/api/invoices/:id) not the actual URL
    // so we don't create a separate metric for every invoice ID
    const route = request.route?.path || request.url;

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.recordMetrics(context, method, route, start);
        },
        error: () => {
          this.recordMetrics(context, method, route, start);
        },
      }),
    );
  }

  private recordMetrics(
    context: ExecutionContext,
    method: string,
    route: string,
    start: number,
  ) {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;
    const duration = (Date.now() - start) / 1000; // convert to seconds

    const labels = { method, route, status_code: String(statusCode) };

    this.histogram.observe(labels, duration);
    this.counter.inc(labels);
  }
}