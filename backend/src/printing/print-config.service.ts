import { Injectable } from '@nestjs/common';

@Injectable()
export class PrintConfigService {
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }
}
