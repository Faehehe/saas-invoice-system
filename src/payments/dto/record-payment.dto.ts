import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
  CREDIT_CARD = 'CREDIT_CARD',
  OTHER = 'OTHER',
}

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsDateString()
  paidAt: string;

  @IsString()
  @IsOptional()
  notes?: string;
}