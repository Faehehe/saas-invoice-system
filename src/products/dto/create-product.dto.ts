import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxRate?: number;

  @IsString()
  @IsOptional()
  unit?: string;
}