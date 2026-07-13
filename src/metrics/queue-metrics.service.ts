import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';

@Injectable()
export class QueueMetricsService {
  constructor(
    @InjectQueue('pdf-generation') private pdfQueue: Queue,
    @InjectMetric('bullmq_queue_depth') private gauge: Gauge<string>,
  ) {}

  @Interval(5000) // every 10 seconds
  async updateQueueDepth() {
    const counts = await this.pdfQueue.getJobCounts('waiting', 'delayed');
    const depth = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    this.gauge.set({ queue_name: 'pdf-generation' }, depth);
  }
}