import type { TsLogger } from '@modules/logger';
import type { BaseHttpClient } from '../core/BaseHttpClient';
import { cargoHttpClientLogMessages } from './log-messages';
import type { CargoMetadata } from './schemas';
import { cargoMetadataSchema } from './schemas';

export interface CargoHttpClientOptions {
  readonly baseHttpClient: BaseHttpClient;
  readonly logger: TsLogger;
}

export class CargoHttpClient {
  private readonly client: BaseHttpClient;
  private readonly logger: TsLogger;

  constructor(options: CargoHttpClientOptions) {
    this.client = options.baseHttpClient;
    this.logger = options.logger.getSubLogger({ name: 'CargoHttpClient' });
  }

  async getCrateMetadata(crateName: string): Promise<CargoMetadata> {
    const logger = this.logger.getSubLogger({ name: 'getCrateMetadata' });
    const url = `https://crates.io/api/v1/crates/${crateName}`;

    logger.debug(cargoHttpClientLogMessages.fetchingCrateMetadata(crateName));

    const response = await this.client.request({
      method: 'GET',
      url,
      responseFormat: 'json',
      schema: cargoMetadataSchema,
      headers: {
        'User-Agent': 'dotfiles-generator',
      },
      cachePolicy: {
        namespace: 'crates.metadata',
      },
      errorMapping: {
        defaultCode: 'CARGO_CRATE_NOT_FOUND',
        statusCodeMap: {
          404: 'CARGO_CRATE_NOT_FOUND',
        },
        schemaErrorCode: 'CARGO_INVALID_METADATA_SCHEMA',
        networkErrorCode: 'DOWNLOAD_NETWORK_FAILURE',
        timeoutErrorCode: 'DOWNLOAD_TIMEOUT',
      },
    });

    logger.debug(
      cargoHttpClientLogMessages.crateMetadataFetched(response.body.crate.name, response.body.crate.max_version)
    );
    return response.body;
  }
}
