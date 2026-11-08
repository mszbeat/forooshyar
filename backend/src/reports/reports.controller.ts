import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('summary') summary(@Req() req: { principal: Principal }) {
    return this.reports.summary(req.principal.shopId);
  }
  @Get('attention') attention(@Req() req: { principal: Principal }) {
    return this.reports.attention(req.principal.shopId);
  }
  @Get('notifications') notifications(@Req() req: { principal: Principal }) {
    return this.reports.notifications(req.principal.shopId);
  }
}
