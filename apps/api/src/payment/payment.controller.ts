import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception';
import { rethrowDatabaseError } from '../common/database-error';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { PaymentFlowError, PaymentService } from './payment.service';

type NotifyRequest = Request & { rawBody?: Buffer };

@ApiTags('commerce')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller()
export class CommerceOrderController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Get('commerce/skus')
  @ApiOperation({
    summary: '在售权益目录',
    description: '只返回 enabled 的 SKU，按 sort_order、code 排序。不含 updatedBy。',
  })
  listSkus(@Query('type') type?: string) {
    return this.run(() => this.payment.listSkus(type));
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建订单并预下单',
    description:
      '金额以服务端 SKU 或升级询价为准。请求里的 amountFen 会被忽略。未配置支付且未打开 mock 时返回 PAY_NOT_CONFIGURED。',
  })
  create(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    return this.run(() => this.payment.createOrder(user, body));
  }

  @Post('orders/upgrade-quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '会员升级询价',
    description: '按剩余天数折算差价。无有效会员、同档或降档不会给出可支付差价。',
  })
  quote(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    return this.run(() => this.payment.upgradeQuote(user.id, body));
  }

  @Get('orders')
  @ApiOperation({ summary: '我的订单', description: '只读。limit 默认 20，最大 50。' })
  list(
    @CurrentUser() user: UserSummary,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.run(() => this.payment.listOrders(user.id, limit, cursor));
  }

  @Get('orders/:outTradeNo')
  @ApiOperation({ summary: '订单详情', description: '只能看自己的订单。不返回商户密钥。' })
  get(@CurrentUser() user: UserSummary, @Param('outTradeNo') outTradeNo: string) {
    return this.run(() => this.payment.getOrder(user.id, outTradeNo));
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((error: unknown) => failPayment(error));
  }
}

@ApiTags('pay')
@Controller()
export class PayNotifyController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Post('pay/wx/notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '微信支付回调',
    description:
      '没有用户 Bearer。验签失败返回 401。金额不一致返回 400 且不入账。已支付的重复通知返回 200，不再次发放权益。',
  })
  notify(@Req() request: NotifyRequest) {
    const raw = request.rawBody?.toString('utf8') ?? '';
    return this.payment
      .handleNotify(raw, request.headers)
      .catch((error: unknown) => failPayment(error));
  }
}

@ApiTags('pay')
@Controller()
export class PayMockController {
  constructor(@Inject(PaymentService) private readonly payment: PaymentService) {}

  @Post('dev/pay/mock-notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '模拟支付成功',
    description: '仅非生产且 WECHAT_PAY_MOCK 为 true 或 1。生产恒为 404。不验微信签名。',
  })
  mock(@Body() body: unknown) {
    return this.payment.mockNotify(body).catch((error: unknown) => failPayment(error));
  }
}

function failPayment(error: unknown): never {
  if (error instanceof PaymentFlowError) {
    throw new ApiException(error.status, error.code, error.message);
  }
  if (error instanceof ApiException) {
    throw error;
  }
  rethrowDatabaseError('payment', error);
}
