import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  makeHistogramProvider,
  makeCounterProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { QueueMetricsService } from './queue-metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true }, // CPU, memory, event loop lag, etc.
    }),
    BullModule.registerQueue({ name: 'pdf-generation' }),
  ],
  providers: [
    // Tracks how long each HTTP request takes
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    }),
    // Counts total requests (for error rate calculation)
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    }),
    // Tracks BullMQ queue depth
    makeGaugeProvider({
      name: 'bullmq_queue_depth',
      help: 'Number of jobs waiting in the queue',
      labelNames: ['queue_name'],
    }),
    QueueMetricsService,
  ],
  exports: [
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    }),
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeGaugeProvider({
      name: 'bullmq_queue_depth',
      help: 'Number of jobs waiting in the queue',
      labelNames: ['queue_name'],
    }),
  ],
})
export class MetricsModule {}