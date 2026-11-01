import { Module } from '@nestjs/common';
import { WechatAuthController } from './wechat-auth.controller';

@Module({
  controllers: [WechatAuthController],
})
export class AuthModule {}
