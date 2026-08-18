import { Global, Module } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { PrintConfigService } from './print-config.service';
import { PrintConfigController } from './print-config.controller';

@Global()
@Module({
  controllers: [PrintConfigController],
  providers: [PrintingService, PrintConfigService],
  exports: [PrintingService, PrintConfigService],
})
export class PrintingModule {}
