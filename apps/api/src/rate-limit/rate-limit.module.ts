import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';

@Module({
  providers: [RateLimitService, { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor }],
  exports: [RateLimitService],
})
export class RateLimitModule {}
