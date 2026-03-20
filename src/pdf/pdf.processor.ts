import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PdfService } from './pdf.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../database/prisma.service';

@Processor('pdf-generation')
export class PdfProcessor extends WorkerHost {
  constructor(
    private pdfService: PdfService,
    private storageService: StorageService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<{ invoiceId: string; tenantId: string }>) {
    const { invoiceId, tenantId } = job.data;

    // 1. Fetch full invoice with line items and customer
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        customer: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // 2. Generate PDF buffer
    const pdfBuffer = await this.pdfService.generateInvoicePdf(invoice);

    // 3. Upload to MinIO
    const path = `${tenantId}/${invoiceId}.pdf`;
    const url = await this.storageService.upload(path, pdfBuffer);

    // 4. Update invoice with PDF URL
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        pdfUrl: url,
        pdfGeneratedAt: new Date(),
      },
    });

    return { url };
  }
}