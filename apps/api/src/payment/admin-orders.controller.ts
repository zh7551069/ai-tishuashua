import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { rethrowDatabaseError } from '../common/database-error';
import { PaymentFlowError, PaymentService } from './payment.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/commerce/orders')
export class AdminOrdersController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Get()
  @ApiOperation({
    summary: '订单只读列表',
    description: '后管会话。可按 userId、outTradeNo、status 筛选。不能改状态，也不能退款。',
  })
  list(
    @Query('userId') userId?: string,
    @Query('outTradeNo') outTradeNo?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.payment
      .listAdmin({ userId, outTradeNo, status, limit, cursor })
      .catch((error: unknown) => {
        if (error instanceof PaymentFlowError) {
          throw new ApiException(error.status, error.code, error.message);
        }
        if (error instanceof ApiException) {
          throw error;
        }
        rethrowDatabaseError('payment', error);
      });
  }
}
