import { HubIdentifier } from './EzloHub';

export interface HubCredentials {
  readonly hubIdentity: HubIdentifier;
  readonly user: string;
  readonly token: string;
}

export interface CredentialsResolver {
  hubs(): Promise<HubIdentifier[]>;
  credentials(hubIdentity: HubIdentifier): Promise<HubCredentials>;
}

export { ConfigFileResolver } from './CredentialsResolvers/ConfigFileResolver';
export { EzloCloudResolver } from './CredentialsResolvers/EzloCloudResolver';