import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  Put,
  Res,
  Patch,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageNamespace, StorageService } from '../storage/storage.service';
import { Readable } from 'stream';

@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);
  namespace = StorageNamespace.FILES;

  constructor(private storageService: StorageService) {}

  @Get(':id')
  @Header('content-type', 'application/octet-stream')
  async findOne(@Param() params, @Res() res: Response): Promise<void> {
    const data = await this.storageService.get(params.id, this.namespace);
    this.logger.debug(`Get image ${params.id}`);

    if (!data) {
      throw new NotFoundException();
    }

    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    stream.pipe(res);
  }

  @Put(':id')
  async create(@Param() params, @Body() payload: Buffer) {
    const id = params.id;
    await this.storageService.set(id, payload, this.namespace);
    this.logger.debug(`Created image ${id}`);

    return {
      id,
    };
  }

  @Patch(':id/timestamp')
  async touch(@Param('id') id: string) {
    this.logger.debug(`[touch] Starting for file ${id}`);

    const updated = await this.storageService.touch(id, this.namespace);

    if (!updated) {
      this.logger.warn(`[touch] File ${id} not found`);
      throw new NotFoundException();
    }

    const updatedAt = new Date().toISOString();
    this.logger.debug(
      `[touch] ✅ Refreshed TTL for file ${id} -> ${updatedAt}`,
    );

    return { id, updatedAt };
  }
}
