import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { ApiException } from './common/api.exception';

/** 只给缓存头测试用，不挂进 AppModule。 */
@Controller('cache-probe')
export class HttpCacheProbeController {
  @Get('ok')
  ok(): { status: string } {
    return { status: 'ok' };
  }

  @Get('private')
  privateRoute(): never {
    throw new ApiException(HttpStatus.UNAUTHORIZED, ApiErrorCode.UNAUTHORIZED, '缺少登录会话');
  }
}

@Module({ controllers: [HttpCacheProbeController] })
export class HttpCacheProbeModule {}
