import { AuthMethodId, getAppConfig } from '../../config/appConfig';
import { AuthMethod } from './types';
import { passwordMethod } from './password';

const ALL_METHODS: Record<AuthMethodId, AuthMethod> = {
  password: passwordMethod,
};

/** The methods the app enabled, in the order it listed them. */
export function getEnabledAuthMethods(): AuthMethod[] {
  return getAppConfig().auth.methods.map((id) => ALL_METHODS[id]).filter(Boolean);
}
