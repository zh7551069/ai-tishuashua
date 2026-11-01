import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder } from '@tishuashua/shared';

@ApiTags('wrong-book')
@Controller('wrong-book')
export class WrongBookController {
  @Get()
  @ApiOperation({ summary: '错题本（占位）' })
  list() {
    return scaffoldPlaceholder('wrong-book', 'list');
  }
}
