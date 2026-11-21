import { healthResponseSchema } from '@edutrack/contracts';
import { ApiClientError } from '../../src/lib/api/api-client-error';
import { apiRequest } from '../../src/lib/api/http-client';

const result = document.querySelector<HTMLOutputElement>('#health-result');

if (!result!) {
  throw new Error('Health result element is missing from the integration harness.');
}

async function loadHealth(): Promise<void> {
  try {
    const response = await apiRequest('/health', {
      responseSchema: healthResponseSchema,
    });

    result!.dataset.state = 'success';
    result!.dataset.status = response.data.status;
    result!.dataset.contract = 'valid';
    result!.textContent = `Backend status: ${response.data.status}`;
  } catch (error) {
    result!.dataset.state = 'error';
    result!.dataset.errorKind = error instanceof ApiClientError ? error.kind : 'unexpected';
    result!.textContent =
      error instanceof ApiClientError ? error.message : 'The health check could not be completed.';
  }
}

void loadHealth();
