import { ApiRequestError, evaluateScenario } from '../api';

describe('training API timeout handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    const pendingFetch: typeof fetch = (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };
    global.fetch = jest.fn(pendingFetch) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('returns a clear timeout error instead of waiting indefinitely', async () => {
    const request = evaluateScenario({
      scenario_id: '11111111-1111-4111-8111-111111111111',
      selected_option_id: 'report',
    });

    jest.advanceTimersByTime(20_000);

    await expect(request).rejects.toMatchObject<Partial<ApiRequestError>>({
      status: 408,
      message: 'Cererea a durat prea mult. Verifică conexiunea și încearcă din nou.',
    });
  });
});
