import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strips unknown properties
      forbidNonWhitelisted: true,  // throws error on unknown properties
      transform: true,        // auto-transform payloads to DTO types
    }),
  );

  await app.listen(3000);
}
bootstrap();