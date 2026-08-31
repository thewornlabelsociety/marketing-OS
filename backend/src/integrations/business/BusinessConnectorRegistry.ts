import type { BusinessIntegrationConnector } from '../../types/businessIntegration';

class BusinessConnectorRegistry {
  private readonly connectors = new Map<string, BusinessIntegrationConnector>();
  register(connector: BusinessIntegrationConnector): void { this.connectors.set(connector.type, connector); }
  get(type: string): BusinessIntegrationConnector | undefined { return this.connectors.get(type); }
}

export const businessConnectorRegistry = new BusinessConnectorRegistry();
