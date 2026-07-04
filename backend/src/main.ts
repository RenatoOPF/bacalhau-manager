import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? 3001);
  // '0.0.0.0' é obrigatório em containers (Fly/Docker) para aceitar
  // conexões externas; ligar só em localhost não seria alcançável.
  await app.listen(port, '0.0.0.0');
  Logger.log(`Backend rodando em http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
