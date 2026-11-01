export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
}
