import { BadRequestException, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { ImportService } from './import.service';

@Controller('catalog')
@UseGuards(AuthGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }))
  importFile(@Req() req: { principal: Principal }, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A file is required');
    return this.imports.importFile(req.principal.shopId, req.principal.userId, file.originalname, file.buffer);
  }
}
