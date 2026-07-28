import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query for the per-vehicle master report: one vehicle, one date range.
 * Unlike ReportRangeDto (fleet-wide), `imei` is required — the whole report
 * is scoped to a single vehicle the caller owns.
 */
export class MasterReportDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,32}$/, {
    message: 'imei must be alphanumeric',
  })
  imei: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  @IsOptional()
  @IsString()
  tz?: string;
}
