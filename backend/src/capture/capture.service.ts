import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Harness de captura das impressões do iFood/99 ("impressora fake").
 *
 * Sobe um servidor TCP raw (protocolo de impressora de rede / JetDirect). No
 * PC do caixa, cria-se uma impressora do Windows cujo porto é um "Standard
 * TCP/IP Port" apontando para 127.0.0.1:CAPTURE_PORT, e configura-se o app do
 * iFood/99 para imprimir nela. Cada job de impressão chega aqui como bytes
 * crus, que são salvos para análise/parsing posterior.
 *
 * Ativado apenas quando CAPTURE_PORT está definido (ex.: 9100). CAPTURE_DIR
 * define onde salvar (padrão: ./captures).
 *
 * Fase atual: só COLETA amostras (bin + preview de texto). O parser por
 * plataforma e a criação do pedido entram numa fase seguinte, com base nas
 * amostras reais.
 */
@Injectable()
export class CaptureService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CaptureService.name);
  private server?: net.Server;
  private readonly port = Number(process.env.CAPTURE_PORT ?? 0);
  private readonly dir =
    process.env.CAPTURE_DIR ?? path.join(process.cwd(), 'captures');

  onModuleInit() {
    if (!this.port) {
      this.logger.log('Captura desligada (defina CAPTURE_PORT para ativar).');
      return;
    }
    fs.mkdirSync(this.dir, { recursive: true });

    this.server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (d) => chunks.push(d));
      socket.on('error', (e) =>
        this.logger.error(`Erro no socket de captura: ${e.message}`),
      );
      socket.on('close', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length > 0) this.save(buf);
      });
    });

    this.server.on('error', (e) =>
      this.logger.error(`Erro no servidor de captura: ${e.message}`),
    );
    this.server.listen(this.port, '0.0.0.0', () =>
      this.logger.log(
        `Captura ouvindo em 0.0.0.0:${this.port} — salvando em ${this.dir}`,
      ),
    );
  }

  onModuleDestroy() {
    this.server?.close();
  }

  private save(buf: Buffer) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(this.dir, ts);
    try {
      fs.writeFileSync(`${base}.bin`, buf);
      fs.writeFileSync(`${base}.txt`, this.preview(buf), { encoding: 'utf8' });
      this.logger.log(
        `Impressão capturada: ${buf.length} bytes → ${ts}.bin (+ .txt)`,
      );
    } catch (e) {
      this.logger.error(`Falha ao salvar captura: ${(e as Error).message}`);
    }
  }

  /**
   * Preview de texto (best-effort) só para inspeção rápida — remove os códigos
   * de controle ESC/POS mais comuns e decodifica o resto como latin1. O .bin
   * cru continua sendo a fonte de verdade para o parser definitivo.
   */
  private preview(buf: Buffer): string {
    const out: number[] = [];
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b === 0x1b || b === 0x1d) {
        // ESC/GS: pula a sequência de comando (heurística: comando + 1 arg).
        i += 1;
        continue;
      }
      if (b === 0x0a) {
        out.push(0x0a);
        continue;
      }
      if (b >= 0x20) out.push(b);
    }
    return Buffer.from(out).toString('latin1');
  }
}
