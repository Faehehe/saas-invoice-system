import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PdfService } from './pdf.service';
import { PdfProcessor } from './pdf.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'pdf-generation' }),
  ],
  providers: [PdfService, PdfProcessor],
  exports: [PdfService, BullModule],
})
export class PdfModule {}