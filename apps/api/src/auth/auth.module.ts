import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserModule } from '../user/user.module';
import { loadApiEnv } from '../config/env';
import { WechatAuthController } from './wechat-auth.controller';
import { WechatCodeExchange } from './wechat-code.exchange';
import { WechatLoginService } from './wechat-login.service';

@Module({
  imports: [UserModule],
  controllers: [WechatAuthController],
  providers: [
    {
      provide: WechatCodeExchange,
      useFactory: (config: ConfigService) => {
        const env = loadApiEnv(config);
        return new WechatCodeExchange({
          appId: env.wechatAppId,
          appSecret: env.wechatAppSecret,
          mock: env.wechatLoginMock,
        });
      },
      inject: [ConfigService],
    },
    WechatLoginService,
  ],
})
export class AuthModule {}
