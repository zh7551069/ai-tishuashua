import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder } from '@tishuashua/shared';

@ApiTags('user')
@Controller('users')
export class UserController {
  @Get('me')
  @ApiOperation({ summary: '当前用户（占位）', description: '依赖微信登录，尚未实现。' })
  me() {
    return scaffoldPlaceholder('user', 'me');
  }
}
