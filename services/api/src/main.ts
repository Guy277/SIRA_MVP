import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { corsOrigin, corsStartupNotice } from "./cors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  // Same rule as Socket.IO (src/cors.ts): CORS_ORIGIN, plus the phone on the Wi-Fi in development.
  app.enableCors({ origin: corsOrigin(), credentials: true });
  const notice = corsStartupNotice();
  if (notice) console.warn(notice);
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

bootstrap();
