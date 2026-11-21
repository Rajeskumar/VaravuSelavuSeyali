import React from 'react';
import { AuthMethodId } from '../../config/appConfig';

/**
 * A sign-in method. `Form` renders the method's controls inside the sign-in screen's form column
 * (return a fragment so its children share the column's spacing) and calls `useAuth().signIn…`
 * itself. To add a method: create `methods/<id>.tsx`, add its id to `AuthMethodId`, and register it in
 * `methods/index.ts`; apps then opt in through `AppConfig.auth.methods`.
 */
export interface AuthMethod {
  id: AuthMethodId;
  Form: React.ComponentType;
}
