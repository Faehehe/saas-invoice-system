import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { PdfModule } from './pdf/pdf.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsMiddleware } from './metrics/metrics.middleware';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    QueueModule,
    StorageModule,
    MetricsModule,
    AuthModule,
    CustomersModule,
    ProductsModule,
    InvoicesModule,
    PaymentsModule,
    ReportsModule,
    PdfModule,
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}