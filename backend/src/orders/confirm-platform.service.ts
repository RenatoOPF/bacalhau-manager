import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

type Channel = 'IFOOD' | 'NOVENTA_NOVE';

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

  /* ── iFood ──────────────────────────────────────────────────────────── */

  private async confirmIfood(localizador: string, customerCode: string) {
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? undefined,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      const page = await context.newPage();

      await page.goto('https://confirmacao-entrega-propria.ifood.com.br/', {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // Tela inicial: "Cheguei no local"
      await page.click('.DeliveryConfirmation__footer-button');
      await page.waitForURL('**/numero-pedido', { timeout: 10_000 });

      // Passo 1: preencher localizador (8 inputs OTP tipo="tel")
      await this.fillOtp(page, '.OptInput__input', localizador);
      await page.click('button:has-text("Continuar")');

      // Aguardar passo 2 ou mensagem de erro
      await page.waitForSelector(
        'button:has-text("Confirmar"), .OptInput__input, button:has-text("Tentar novamente")',
        { timeout: 12_000 },
      );

      const hasRetry = await page.locator('button:has-text("Tentar novamente")').count();
      if (hasRetry > 0) {
        throw new BadRequestException(
          'Localizador não encontrado no iFood. Verifique o número na comanda.',
        );
      }

      // Passo 2: preencher código do cliente
      await this.fillOtp(page, 'input[type="tel"]', customerCode);
      await page.locator('button:has-text("Confirmar")').first().click();

      // Aguardar resultado
      await page.waitForSelector(
        '[class*="success"], [class*="confirmed"], button:has-text("Tentar novamente"), button:has-text("Fechar")',
        { timeout: 12_000 },
      );

      const hasError = await page.locator('button:has-text("Tentar novamente")').count();
      if (hasError > 0) {
        throw new BadRequestException(
          'Código de confirmação incorreto. Peça ao cliente para verificar.',
        );
      }

      this.logger.log(`[iFood] entrega confirmada — localizador ${localizador}`);
    } finally {
      await browser.close();
    }
  }

  /* ── 99Food ─────────────────────────────────────────────────────────── */

  private async confirm99Food(localizador: string, customerCode: string) {
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? undefined,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    try {
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      const page = await context.newPage();

      await page.goto(
        'https://food-b-h5.99app.com/pt-BR/v2/confirmation-entrega',
        { waitUntil: 'networkidle', timeout: 30_000 },
      );

      // Passo 1: preencher localizador (8 inputs text maxlength=1)
      await page.waitForSelector('input[type="text"]', { timeout: 10_000 });
      await this.fillOtp(page, 'input[type="text"]', localizador);
      await page.click('button:has-text("Verificar e continuar")');

      // Aguardar passo 2 ou erro
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('Etapa 2') ||
          document.body.innerText.includes('não foi identificado'),
        { timeout: 12_000 },
      );

      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes('não foi identificado')) {
        throw new BadRequestException(
          'Localizador não encontrado no 99Food. Verifique o número na comanda.',
        );
      }

      // Passo 2: preencher código do cliente (também OTP inputs text)
      // Aguarda novos inputs aparecerem (os do passo 1 são substituídos ou somem)
      await page.waitForFunction(
        () => {
          const inputs = document.querySelectorAll('input[type="text"]');
          return inputs.length > 0 && (inputs[0] as HTMLInputElement).value === '';
        },
        { timeout: 10_000 },
      );
      await this.fillOtp(page, 'input[type="text"]', customerCode);

      // Clicar no botão de confirmação (texto pode variar)
      const btn = page.locator('button').filter({
        hasText: /Confirmar|Verificar e continuar|Enviar/i,
      }).first();
      await btn.click();

      // Aguardar resultado
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('confirmad') ||
          document.body.innerText.includes('sucesso') ||
          document.body.innerText.includes('incorreto') ||
          document.body.innerText.includes('inválido'),
        { timeout: 12_000 },
      );

      const finalText = await page.evaluate(() => document.body.innerText);
      if (
        finalText.toLowerCase().includes('incorreto') ||
        finalText.toLowerCase().includes('inválido') ||
        finalText.toLowerCase().includes('não identificado')
      ) {
        throw new BadRequestException(
          'Código de confirmação incorreto. Peça ao cliente para verificar.',
        );
      }

      this.logger.log(`[99Food] entrega confirmada — localizador ${localizador}`);
    } finally {
      await browser.close();
    }
  }

  /* ── Helper ─────────────────────────────────────────────────────────── */

  private async fillOtp(page: import('playwright').Page, selector: string, value: string) {
    const inputs = await page.$$(selector);
    for (let i = 0; i < value.length && i < inputs.length; i++) {
      await inputs[i].click();
      // Playwright fill() substitui todo o conteúdo; type() appenda — usamos fill + delay
      await inputs[i].fill(value[i]);
      await page.waitForTimeout(60);
    }
  }
}
