import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // RECORD PAYMENT — Must update invoice status atomically
  // ============================================================
  async recordPayment(
    tenantId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Find the invoice
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      // 2. Validate: can't pay a draft, cancelled, or already paid invoice
      if (['DRAFT', 'CANCELLED', 'REFUNDED'].includes(invoice.status)) {
        throw new BadRequestException(
          `Cannot record payment for ${invoice.status} invoice`,
        );
      }

      // 3. Validate: can't overpay
      const amountDue = Number(invoice.amountDue);
      if (dto.amount > amountDue) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds amount due (${amountDue})`,
        );
      }

      // 4. Create the payment record
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          paidAt: new Date(dto.paidAt),
          notes: dto.notes,
        },
      });

      // 5. Update invoice amounts
      const newAmountPaid = Number(invoice.amountPaid) + dto.amount;
      const newAmountDue = Number(invoice.total) - newAmountPaid;

      // 6. Determine new status
      let newStatus: InvoiceStatus;
      if (newAmountDue <= 0) {
        newStatus = InvoiceStatus.PAID;
      } else if (newAmountPaid > 0) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      } else {
        newStatus = invoice.status;
      }

      // 7. Update the invoice
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          amountDue: Math.max(newAmountDue, 0), // never negative
          status: newStatus,
        },
      });

      return {
        payment,
        invoice: {
          id: invoiceId,
          amountPaid: newAmountPaid,
          amountDue: Math.max(newAmountDue, 0),
          status: newStatus,
        },
      };
    });
  }

  // ============================================================
  // LIST PAYMENTS for an invoice
  // ============================================================
  async findByInvoice(tenantId: string, invoiceId: string) {
    // Verify invoice belongs to tenant
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paidAt: 'desc' },
    });

    return {
      data: payments,
      invoiceSummary: {
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        status: invoice.status,
      },
    };
  }

  // ============================================================
  // VOID a payment — reverses the amount
  // ============================================================
  async voidPayment(tenantId: string, paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, tenantId },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      // Update invoice: subtract the voided payment amount
      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }

      const newAmountPaid = Number(invoice.amountPaid) - Number(payment.amount);
      const newAmountDue = Number(invoice.total) - newAmountPaid;

      let newStatus: InvoiceStatus;
      if (newAmountPaid <= 0) {
        newStatus = InvoiceStatus.SENT; // back to sent since no payments remain
      } else {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: Math.max(newAmountPaid, 0),
          amountDue: newAmountDue,
          status: newStatus,
        },
      });

      // Delete the payment
      await tx.payment.delete({
        where: { id: paymentId },
      });

      return {
        message: 'Payment voided',
        invoice: {
          id: payment.invoiceId,
          amountPaid: Math.max(newAmountPaid, 0),
          amountDue: newAmountDue,
          status: newStatus,
        },
      };
    });
  }
}