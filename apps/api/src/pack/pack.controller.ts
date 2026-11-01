import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { parseDto } from '../common/parse-dto';
import { SessionAuthGuard } from '../session/session-auth.guard';
import {
  CreatePackDto,
  DeletePackResultDto,
  PackListDto,
  PackViewDto,
  UpdatePackDto,
} from './dto/pack.dto';
import { PackService } from './pack.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('packs')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('packs')
export class PackController {
  constructor(@Inject(PackService) private readonly packs: PackService) {}

  @Get()
  @ApiOperation({ summary: '我的刷题包', description: 'activePackId 是当前包。没有包时为 null。' })
  @ApiOkResponse({ type: PackListDto })
  list(@CurrentUser() user: UserSummary) {
    return this.packs.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '保存刷题包',
    description: '新建后成为当前包。知识点必须属于该证书且已上架。',
  })
  @ApiBody({ type: CreatePackDto })
  @ApiCreatedResponse({ type: PackViewDto })
  async create(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    const dto = await parseDto(CreatePackDto, body);
    return this.packs.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '读取刷题包' })
  @ApiOkResponse({ type: PackViewDto })
  getOne(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.packs.get(user.id, id);
  }

  @Put(':id')
  @ApiOperation({
    summary: '重命名或更换知识点',
    description: '证书已下架时返回 PACK_UNAVAILABLE。只可删除，不可修改。',
  })
  @ApiBody({ type: UpdatePackDto })
  @ApiOkResponse({ type: PackViewDto })
  async update(
    @CurrentUser() user: UserSummary,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(UpdatePackDto, body);
    return this.packs.update(user.id, id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '设为当前刷题包',
    description: '下架包仍可被选为当前包，以便首页展示不可用态。',
  })
  @ApiOkResponse({ type: PackViewDto })
  activate(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.packs.activate(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除刷题包',
    description: '删掉当前包时，会把最近更新的另一个包设为当前包。',
  })
  @ApiOkResponse({ type: DeletePackResultDto })
  remove(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.packs.remove(user.id, id);
  }
}
