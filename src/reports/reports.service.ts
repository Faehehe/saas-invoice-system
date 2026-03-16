import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(tenantId: string) {
    // Run all queries in parallel for speed
    const [
      totalRevenue,
      totalOutstanding,
      totalOverdue,
      invoiceCounts,
      recentInvoices,
      topCustomers,
    ] = await Promise.all([
      // Total revenue (sum of all paid amounts)
      this.prisma.payment.aggregate({
        where: { tenantId },
        _sum: { amount: true },
      }),

      // Total outstanding (sum of amountDue for unpaid invoices)
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        _sum: { amountDue: true },
      }),

      // Total overdue (invoices past due date that aren't paid)
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: { in: ['SENT', 'PARTIALLY_PAID'] },
          dueDate: { lt: new Date() },
        },
        _sum: { amountDue: true },
        _count: true,
      }),

      // Invoice counts by status
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),

      // Recent 5 invoices
      this.prisma.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          customer: { select: { id: true, name: true } },
        },
      }),

      // Top 5 customers by revenue
      this.prisma.payment.groupBy({
        by: ['invoiceId'],
        where: { tenantId },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
    ]);

    // Fetch customer names for top customers
    const topCustomerInvoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: topCustomers.map((tc) => tc.invoiceId) },
      },
      select: {
        id: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
      },
    });

    // Aggregate by customer
    const customerRevenueMap = new Map<string, { name: string; revenue: number }>();
    for (const tc of topCustomers) {
      const inv = topCustomerInvoices.find((i) => i.id === tc.invoiceId);
      if (inv) {
        const existing = customerRevenueMap.get(inv.customerId);
        const amount = Number(tc._sum.amount || 0);
        if (existing) {
          existing.revenue += amount;
        } else {
          customerRevenueMap.set(inv.customerId, {
            name: inv.customer.name,
            revenue: amount,
          });
        }
      }
    }

    const topCustomersList = Array.from(customerRevenueMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      summary: {
        totalRevenue: Number(totalRevenue._sum.amount || 0),
        totalOutstanding: Number(totalOutstanding._sum.amountDue || 0),
        totalOverdue: Number(totalOverdue._sum.amountDue || 0),
        overdueCount: totalOverdue._count || 0,
      },
      invoicesByStatus: invoiceCounts.map((ic) => ({
        status: ic.status,
        count: ic._count,
      })),
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer.name,
        total: Number(inv.total),
        amountDue: Number(inv.amountDue),
        status: inv.status,
        dueDate: inv.dueDate,
      })),
      topCustomers: topCustomersList,
    };
  }
}