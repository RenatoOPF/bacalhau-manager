import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrintConfigService } from './print-config.service';

@Controller('config/printing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PrintConfigController {
  constructor(private readonly config: PrintConfigService) {}

  @Get()
  get() {
    return { enabled: this.config.isEnabled() };
  }

  @Patch()
  set(@Body() body: { enabled: boolean }) {
    this.config.setEnabled(body.enabled);
    return { enabled: this.config.isEnabled() };
  }
}
