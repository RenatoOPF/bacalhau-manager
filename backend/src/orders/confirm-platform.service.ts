import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

type Channel = 'IFOOD' | 'NOVENTA_NOVE';

const IFOOD_BASE =
  'https://merchant-api.ifood.com.br/marketplace-delivery-handshake/order-available/localizers';

const IFOOD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': 'https://confirmacao-entrega-propria.ifood.com.br',
  'Referer': 'https://confirmacao-entrega-propria.ifood.com.br/',
};

@Injectable()
export class ConfirmPlatformService {
  private readonly logger = new Logger(ConfirmPlatformService.name);

  async confirm(
    channel: Channel,
    localizador: string,
    customerCode: string,
  ): Promise<void> {
    if (channel === 'IFOOD') {
      await this.confirmIfood(localizador, customerCode);
    } else if (channel === 'NOVENTA_NOVE') {
      await this.confirm99Food(localizador, customerCode);
    } else {
      throw new BadRequestException(
        `Canal ${channel} não suporta confirmação de plataforma`,
      );
    }
  }

  /* ── iFood (HTTP direto — sem browser) ───────────────────────────────── */

  private async confirmIfood(localizador: string, customerCode: string) {
    const safeLoc = encodeURIComponent(localizador.trim());
    // Passo 1: validar localizador
    const step1 = await fetch(`${IFOOD_BASE}/${safeLoc}`, {
      headers: IFOOD_HEADERS,
    });

    if (step1.status === 404) {
      throw new BadRequestException(
        'Localizador não encontrado no iFood. Verifique o número na comanda.',
      );
    }
    if (!step1.ok) {
      throw new BadRequestException(
        `Erro ao consultar o iFood (${step1.status}). Tente novamente.`,
      );
    }

    // Passo 2: confirmar com o código do cliente
    const step2 = await fetch(
      `${IFOOD_BASE}/${safeLoc}/confirmation-codes`,
      {
        method: 'POST',
        headers: IFOOD_HEADERS,
        body: JSON.stringify({ confirmationCode: customerCode }),
      },
    );

    if (step2.status === 400 || step2.status === 422) {
      throw new BadRequestException(
        'Código de confirmação incorreto. Peça ao cliente para verificar.',
      );
    }
    if (!step2.ok) {
      const body = await step2.text().catch(() => '');
      this.logger.warn(`[iFood] step2 falhou — status ${step2.status}: ${body}`);
      throw new BadRequestException(
        `Não foi possível confirmar no iFood (${step2.status}). Tente pelo app.`,
      );
    }

    this.logger.log(`[iFood] entrega confirmada — localizador ${localizador}`);
  }

  /* ── 99Food ──────────────────────────────────────────────────────────── */

  // A API do 99Food exige um token wsgsig gerado por JS client-side, o que
  // requer browser headless. Fly.io não tem RAM suficiente para Chromium.
  // Por ora, retorna erro orientando o entregador a confirmar pelo app.
  private async confirm99Food(_localizador: string, _customerCode: string) {
    throw new BadRequestException(
      'Confirmação automática no 99Food ainda não está disponível. ' +
        'Acesse food-b-h5.99app.com/pt-BR/v2/confirmation-entrega no seu celular.',
    );
  }
}
