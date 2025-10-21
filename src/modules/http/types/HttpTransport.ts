import type { HttpTransportRequest, HttpTransportResponse } from '../types/HttpTypes';

export interface HttpTransport {
  execute(request: HttpTransportRequest): Promise<HttpTransportResponse>;
}
