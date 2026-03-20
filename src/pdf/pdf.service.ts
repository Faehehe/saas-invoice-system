import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

@Injectable()
export class PdfService {
  async generateInvoicePdf(invoice: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('INVOICE', { align: 'right' });
      doc.fontSize(10).text(`Invoice #: ${invoice.invoiceNumber}`, { align: 'right' });
      doc.text(`Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, { align: 'right' });
      doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, { align: 'right' });

      doc.moveDown(2);

      // Bill To
      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10).text(invoice.customer.name);
      if (invoice.customer.email) doc.text(invoice.customer.email);
      if (invoice.customer.company) doc.text(invoice.customer.company);

      doc.moveDown(2);

      // Table header
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Qty', 280, tableTop, { width: 60, align: 'right' });
      doc.text('Price', 350, tableTop, { width: 80, align: 'right' });
      doc.text('Tax %', 430, tableTop, { width: 40, align: 'right' });
      doc.text('Total', 480, tableTop, { width: 70, align: 'right' });

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      // Line items
      doc.font('Helvetica');
      let y = tableTop + 25;
      for (const item of invoice.lineItems) {
        doc.text(item.description, 50, y, { width: 220 });
        doc.text(String(item.quantity), 280, y, { width: 60, align: 'right' });
        doc.text(`${Number(item.unitPrice).toFixed(2)}`, 350, y, { width: 80, align: 'right' });
        doc.text(`${Number(item.taxRate)}%`, 430, y, { width: 40, align: 'right' });
        doc.text(`${Number(item.lineTotal).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 20;
      }

      // Totals
      doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();
      y += 15;
      doc.font('Helvetica-Bold');
      doc.text('Subtotal:', 400, y, { width: 80, align: 'right' });
      doc.text(`${Number(invoice.subtotal).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
      y += 20;
      doc.text('Tax:', 400, y, { width: 80, align: 'right' });
      doc.text(`${Number(invoice.taxTotal).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
      y += 20;
      doc.fontSize(12).text('Total:', 400, y, { width: 80, align: 'right' });
      doc.text(`INR ${Number(invoice.total).toFixed(2)}`, 480, y, { width: 70, align: 'right' });

      // Notes
      if (invoice.notes) {
        doc.moveDown(4);
        doc.fontSize(10).font('Helvetica');
        doc.text('Notes:', { underline: true });
        doc.text(invoice.notes);
      }

      doc.end();
    });
  }
}