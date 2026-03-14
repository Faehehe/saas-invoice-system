import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerDto } from './create-customer.dto';

// PartialType makes all fields optional — perfect for PATCH requests
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}