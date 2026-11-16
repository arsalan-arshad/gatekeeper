import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/$/, '');

const missingConfiguration = !projectToken
  ? 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN'
  : !posthogHost
    ? 'NEXT_PUBLIC_POSTHOG_HOST'
    : null;

if (missingConfiguration && process.env.NODE_ENV !== 'production') {
  console.warn(
    `${missingConfiguration} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingConfiguration} is configured`,
  );
}

export const posthogLogsProvider =
  projectToken && posthogHost
    ? new LoggerProvider({
        resource: resourceFromAttributes({ 'service.name': '@gatekeeper/web' }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: `${posthogHost}/i/v1/logs`,
              timeoutMillis: 2000,
              headers: {
                Authorization: `Bearer ${projectToken}`,
                'Content-Type': 'application/json',
              },
            }),
          }),
        ],
      })
    : null;

// Use this dedicated logger only for log records introduced by this integration.
export const posthogLogsLogger = posthogLogsProvider?.getLogger('gatekeeper.posthog.logs');

// Next.js loads this module at boot. The provider is deliberately not registered globally:
// existing application logging remains outside this exporter.
export function register() {}
