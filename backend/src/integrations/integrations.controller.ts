import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { IntegrationsService } from './integrations.service';
import { IntegrationKeyGuard } from './integration-key.guard';

class CaptureDto {
  /** Base64 do stream de impressão capturado (ESC/POS). */
  @IsString()
  @MinLength(1)
  raw: string;
}

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /** Recebe uma impressão capturada pelo agente do caixa (iFood/99). */
  @Post('capture')
  @UseGuards(IntegrationKeyGuard)
  capture(@Body() dto: CaptureDto) {
    return this.integrations.ingestCapture(dto.raw);
  }
}
