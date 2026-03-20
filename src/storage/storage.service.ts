import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.config.get('MINIO_ENDPOINT')!,
      port: this.config.get<number>('MINIO_PORT')!,
      useSSL: false,
      accessKey: this.config.get('MINIO_ACCESS_KEY')!,
      secretKey: this.config.get('MINIO_SECRET_KEY')!,
    });
    this.bucket = this.config.get('MINIO_BUCKET') || 'invoices';
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async upload(path: string, buffer: Buffer, contentType = 'application/pdf'): Promise<string> {
    await this.client.putObject(this.bucket, path, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return `http://${this.config.get('MINIO_ENDPOINT')}:${this.config.get('MINIO_PORT')}/${this.bucket}/${path}`;
  }

  async getPresignedUrl(path: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, path, expiry);
  }
}