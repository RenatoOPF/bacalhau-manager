import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Protege o endpoint de ingestão com uma chave estática (INTEGRATION_KEY),
 * enviada pelo agente do caixa no header `x-integration-key`. Fail-closed:
 * sem INTEGRATION_KEY configurado no servidor, nega tudo.
 */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTEGRATION_KEY;
    const provided = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-integration-key');
    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Chave de integração inválida');
    }
    return true;
  }
}
