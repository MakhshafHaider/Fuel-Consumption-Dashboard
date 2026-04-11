import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [],
        synchronize: false,
        timezone: 'Z',
        extra: {
          connectionLimit: 10,
        },
        // ✅ Add: connection drop hone par retry kare
        retryAttempts: 3,
        retryDelay: 3000,
        // ✅ Add: idle connections band kare
        keepConnectionAlive: true,
      }),
    }),
  ],
  // ✅ Add: taake doosre modules import kar sakein
  exports: [TypeOrmModule],
})
export class DatabaseModule {}