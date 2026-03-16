import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('invoices/:invoiceId/payments')
  recordPayment(
    @CurrentUser('tenantId') tenantId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.paymentsService.recordPayment(tenantId, invoiceId, dto);
  }

  @Get('invoices/:invoiceId/payments')
  findByInvoice(
    @CurrentUser('tenantId') tenantId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.paymentsService.findByInvoice(tenantId, invoiceId);
  }

  @Delete('payments/:id')
  voidPayment(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.paymentsService.voidPayment(tenantId, id);
  }
}