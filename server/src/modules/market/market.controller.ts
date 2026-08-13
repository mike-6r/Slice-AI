import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { MarketService } from './market.service';
const text = z.string().trim().min(1).max(120);
const listQuery = z
  .object({
    query: text.max(80).optional(),
    category: z
      .string()
      .regex(/^[a-z0-9-]{1,96}$/)
      .optional(),
    set: z
      .string()
      .regex(/^[a-z0-9-]{1,96}$/)
      .optional(),
    gradingCompany: z
      .string()
      .regex(/^[A-Za-z0-9-]{2,16}$/)
      .optional(),
    gradeMin: z.coerce.number().min(0).max(100).optional(),
    gradeMax: z.coerce.number().min(0).max(100).optional(),
    estimatedMarketValueMinMinor: z.coerce.bigint().nonnegative().optional(),
    estimatedMarketValueMaxMinor: z.coerce.bigint().nonnegative().optional(),
    availabilityMinBps: z.coerce.number().int().min(0).max(10000).optional(),
    sort: z
      .enum(['estimatedMarketValue', 'change24h', 'title'])
      .default('title'),
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .strict();
const moversQuery = z
  .object({
    kind: z.enum(['gainers', 'losers', 'active']).default('gainers'),
    limit: z.coerce.number().int().min(1).max(48).default(12),
  })
  .strict();
const rangeQuery = z
  .object({
    range: z.enum(['1D', '7D', '30D', '3M', '1Y', 'ALL']).default('30D'),
  })
  .strict();
const similarQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(24).default(6) })
  .strict();
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}
  @Get('assets') list(@Query() query: unknown) {
    const input = parse(listQuery, query);
    return this.market.list({
      ...input,
      sort: input.sort ?? 'title',
      limit: input.limit ?? 24,
    });
  }
  @Get('assets/:slug') detail(@Param('slug') slug: string) {
    return this.market.detail(slug);
  }
  @Get('assets/:slug/history') history(
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    return this.market.history(slug, parse(rangeQuery, query).range ?? '30D');
  }
  @Get('assets/:slug/similar') similar(
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    return this.market.similar(slug, parse(similarQuery, query).limit ?? 6);
  }
  @Get('summary') summary() {
    return this.market.summary();
  }
  @Get('movers') movers(@Query() query: unknown) {
    const input = parse(moversQuery, query);
    return this.market.movers(input.kind ?? 'gainers', input.limit ?? 12);
  }
  @Get('providers/health') providerHealth() {
    return this.market.providerHealth();
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'INVALID_FILTER',
      message: 'The market filter is invalid.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  return parsed.data;
}
