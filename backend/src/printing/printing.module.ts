import { Global, Module } from '@nestjs/common';
import { PrintingService } from './printing.service';

@Global()
@Module({
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
