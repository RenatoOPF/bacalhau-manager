import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomersService } from './customers.service';
import {
  CreateAddressDto,
  CreateCustomerDto,
  UpdateAddressDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  list(@Query('search') search?: string) {
    return search?.trim() ? this.svc.search(search.trim()) : this.svc.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/addresses')
  addAddress(@Param('id') id: string, @Body() dto: CreateAddressDto) {
    return this.svc.addAddress(id, dto);
  }

  @Patch(':id/addresses/:addressId')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.svc.updateAddress(id, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return this.svc.removeAddress(id, addressId);
  }
}
