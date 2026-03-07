import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  PipeTransform,
  Put,
  Res,
  Patch,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageNamespace, StorageService } from '../storage/storage.service';
import { Readable } from 'stream';

export const VALID_PREFIXES = ['rooms', 'shareLinks'] as const;
export type FilePrefix = (typeof VALID_PREFIXES)[number];

export class ValidateIdParam implements PipeTransform<string> {
  transform(value: string): string {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(value)) {
      throw new BadRequestException(
        'Parameter must be 1-128 alphanumeric characters or hyphens',
      );
    }
    return value;
  }
}

export class ValidatePrefixParam implements PipeTransform<string> {
  transform(value: string): string {
    if (!VALID_PREFIXES.includes(value as FilePrefix)) {
      throw new BadRequestException(
        `Prefix must be one of: ${VALID_PREFIXES.join(', ')}`,
      );
    }
    return value;
  }
}

@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);
  private readonly namespace = StorageNamespace.FILES;

  constructor(private storageService: StorageService) {}

  // --- Prefixed routes (declared FIRST for correct NestJS route matching) ---
  // Prefixed routes use a composite storage key (prefix_id) to namespace
  // files, preventing collisions between collab rooms and shareable links.
  // For "rooms" prefix, GET and PATCH fall back to the flat key (legacy data).

  @Get(':prefix/:prefixId/:id')
  @Header('content-type', 'application/octet-stream')
  async findOneWithPrefix(
    @Param('prefix', ValidatePrefixParam) prefix: string,
    @Param('prefixId', ValidateIdParam) prefixId: string,
    @Param('id', ValidateIdParam) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const storageKey = this.buildKey(prefix, prefixId, id);
    this.logger.debug(`Get image ${storageKey}`);

    const data = await this.storageService.get(storageKey, this.namespace);

    if (data) {
      return this.sendFile(data, res);
    }

    // Fallback for rooms: try the flat key for legacy collab data
    if (prefix === 'rooms') {
      this.logger.debug(`Fallback to legacy key ${id}`);
      const legacyData = await this.storageService.get(id, this.namespace);

      if (legacyData) {
        return this.sendFile(legacyData, res);
      }
    }

    throw new NotFoundException();
  }

  @Put(':prefix/:prefixId/:id')
  async createWithPrefix(
    @Param('prefix', ValidatePrefixParam) prefix: string,
    @Param('prefixId', ValidateIdParam) prefixId: string,
    @Param('id', ValidateIdParam) id: string,
    @Body() payload: Buffer,
  ) {
    const storageKey = this.buildKey(prefix, prefixId, id);
    await this.putFile(storageKey, payload);
    this.logger.debug(`Created image ${storageKey}`);

    return { id, prefix };
  }

  @Patch(':prefix/:prefixId/:id/timestamp')
  async touchWithPrefix(
    @Param('prefix', ValidatePrefixParam) prefix: string,
    @Param('prefixId', ValidateIdParam) prefixId: string,
    @Param('id', ValidateIdParam) id: string,
  ) {
    const storageKey = this.buildKey(prefix, prefixId, id);
    this.logger.debug(`[touch] Starting for file ${storageKey}`);

    const updated = await this.storageService.touch(storageKey, this.namespace);

    // Fallback for rooms: try the flat key for legacy collab data
    const fallbackUpdated =
      !updated && prefix === 'rooms'
        ? await this.storageService.touch(id, this.namespace)
        : updated;

    if (!fallbackUpdated) {
      this.logger.warn(`[touch] File ${storageKey} not found`);
      throw new NotFoundException();
    }

    const updatedAt = new Date().toISOString();
    this.logger.debug(
      `[touch] Refreshed TTL for file ${storageKey} -> ${updatedAt}`,
    );

    return { id, prefix, updatedAt };
  }

  // --- Legacy routes (no prefix, backwards compatible) ---
  // These routes preserve the original flat key storage for existing clients.

  @Get(':id')
  @Header('content-type', 'application/octet-stream')
  async findOne(
    @Param('id', ValidateIdParam) id: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.debug(`Get image ${id}`);
    const data = await this.storageService.get(id, this.namespace);

    if (!data) {
      throw new NotFoundException();
    }

    return this.sendFile(data, res);
  }

  @Put(':id')
  async create(@Param('id', ValidateIdParam) id: string, @Body() payload: Buffer) {
    await this.putFile(id, payload);
    this.logger.debug(`Created image ${id}`);

    return { id };
  }

  @Patch(':id/timestamp')
  async touch(@Param('id', ValidateIdParam) id: string) {
    this.logger.debug(`[touch] Starting for file ${id}`);

    const updated = await this.storageService.touch(id, this.namespace);

    if (!updated) {
      this.logger.warn(`[touch] File ${id} not found`);
      throw new NotFoundException();
    }

    const updatedAt = new Date().toISOString();
    this.logger.debug(
      `[touch] Refreshed TTL for file ${id} -> ${updatedAt}`,
    );

    return { id, updatedAt };
  }

  // --- Helpers ---

  private buildKey(prefix: string, prefixId: string, id: string): string {
    return `${prefix}_${prefixId}_${id}`;
  }

  private sendFile(data: Buffer, res: Response): void {
    res.setHeader('Content-Length', data.length);
    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    stream.pipe(res);
  }

  private async putFile(
    storageKey: string,
    payload: Buffer,
  ): Promise<void> {
    await this.storageService.set(storageKey, payload, this.namespace);
  }
}
