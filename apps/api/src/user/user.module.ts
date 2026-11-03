import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WechatPhoneExchange } from '../auth/wechat-phone.exchange';
import { loadApiEnv } from '../config/env';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { WechatPhoneService } from './wechat-phone.service';

@Module({
  controllers: [UserController],
  providers: [
    UserRepository,
    SessionAuthGuard,
    {
      provide: WechatPhoneExchange,
      useFactory: (config: ConfigService) => {
        const env = loadApiEnv(config);
        return new WechatPhoneExchange({
          appId: env.wechatAppId,
          appSecret: env.wechatAppSecret,
          mock: env.wechatLoginMock,
        });
      },
      inject: [ConfigService],
    },
    WechatPhoneService,
  ],
  exports: [UserRepository, SessionAuthGuard],
})
export class UserModule {}
