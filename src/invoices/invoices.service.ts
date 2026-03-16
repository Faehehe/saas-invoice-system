import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateInvoiceDto, CreateLineItemDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Prisma, InvoiceStatus } from '@prisma/client';


@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // CREATE — The most complex operation. Everything in ONE transaction.
  // ============================================================
  async create(tenantId: string, userId: string, dto: CreateInvoiceDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Generate invoice number with advisory lock (prevents duplicates)
      const invoiceNumber = await this.getNextInvoiceNumber(tx, tenantId);

      // 2. Calculate line item totals
      const lineItemsWithTotals = dto.lineItems.map((item, index) => {
        const lineTotal = this.calculateLineTotal(item);
        return {
          description: item.description,
          productId: item.productId || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate || 0,
          discount: item.discount || 0,
          lineTotal,
          sortOrder: index,
        };
      });

      // 3. Calculate invoice totals from line items
      const totals = this.calculateInvoiceTotals(dto.lineItems);

      // 4. Create invoice + line items together
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          createdById: userId,
          invoiceNumber,
          issueDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
          currency: dto.currency || 'INR',
          notes: dto.notes,
          terms: dto.terms,
          ...totals,
          amountDue: totals.total,
          lineItems: {
            create: lineItemsWithTotals,
          },
        },
        include: {
          lineItems: true,
          customer: true,
        },
      });

      return invoice;
    });
  }

  // ============================================================
  // INVOICE NUMBER — Sequential per tenant, no gaps
  // ============================================================
  private async getNextInvoiceNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    // Advisory lock: only ONE request per tenant can generate a number at a time
    // hashtext() converts tenant ID to an integer for the lock
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

    const last = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    const nextNum = last
      ? parseInt(last.invoiceNumber.split('-')[1]) + 1
      : 1;

    return `INV-${String(nextNum).padStart(5, '0')}`;
  }

  // ============================================================
  // MATH — Never use floating point for money
  // ============================================================
  private calculateLineTotal(item: CreateLineItemDto): number {
    const gross = item.quantity * item.unitPrice;
    const afterDiscount = gross - (item.discount || 0);
    const tax = afterDiscount * (item.taxRate || 0) / 100;
    return Math.round((afterDiscount + tax) * 100) / 100; // round to 2 decimals
  }

  private calculateInvoiceTotals(lineItems: CreateLineItemDto[]) {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    for (const item of lineItems) {
      const gross = item.quantity * item.unitPrice;
      subtotal += gross;
      discountTotal += item.discount || 0;
      const afterDiscount = gross - (item.discount || 0);
      taxTotal += afterDiscount * (item.taxRate || 0) / 100;
    }

    const total = subtotal - discountTotal + taxTotal;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  // ============================================================
  // READ
  // ============================================================
  async findAll(
    tenantId: string,
    page = 1,
    limit = 20,
    status?: string,
    customerId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        customer: true,
        payments: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  // ============================================================
  // UPDATE — Only DRAFT invoices can be edited
  // ============================================================
  async update(tenantId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findOne(tenantId, id);

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be edited');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        terms: dto.terms,
      },
    });
  }

  // ============================================================
  // STATUS TRANSITIONS
  // ============================================================
  async send(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be sent');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
    });
  }

  async cancel(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot cancel this invoice');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }
}