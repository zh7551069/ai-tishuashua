import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ADMIN_USER_STATUSES, ApiErrorCode } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminUserQuery } from './admin-users.query';
import { AdminUserService } from './admin-users.service';
import { AdminUserListDto, AdminUserSummaryDto } from './dto/admin-users.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/users')
export class AdminUserController {
  constructor(@Inject(AdminUserService) private readonly users: AdminUserService) {}

  @Get()
  @ApiOperation({
    summary: '后管用户列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。默认 status=all，按创建时间从新到旧分页。昵称脱敏，手机号只返回已脱敏的值。不返回 openId。没有封禁或解封。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['all', ...ADMIN_USER_STATUSES] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminUserListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminUserQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.users.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管用户详情',
    description:
      '只读。字段与列表摘要相同。不存在返回 NOT_FOUND。微信用户 token 不能调用。没有封禁写接口。',
  })
  @ApiOkResponse({ type: AdminUserSummaryDto })
  getOne(@Param('id', uuid) id: string) {
    return this.users.get(id);
  }
}
