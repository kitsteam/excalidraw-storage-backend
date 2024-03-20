import { Controller, Get, Logger } from '@nestjs/common';
import { StorageNamespace, StorageService } from '../storage/storage.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  namespace = StorageNamespace.SETTINGS;

  constructor(private storageService: StorageService) {}

  @Get()
  async health(): Promise<string> {
    const timestamp = new Date().getTime().toString();
    await this.storageService.set(
      'last-health-check',
      timestamp,
      this.namespace,
    );
    return 'healthy';
  }
}
