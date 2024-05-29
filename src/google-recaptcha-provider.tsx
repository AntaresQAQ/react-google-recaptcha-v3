import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef
} from 'react';
import {
  cleanGoogleRecaptcha,
  injectGoogleReCaptchaScript,
  logWarningMessage,
  promiseWithResolvers
} from './utils';

enum GoogleRecaptchaError {
  SCRIPT_NOT_AVAILABLE = 'Recaptcha script is not available'
}

interface IGoogleReCaptchaProviderProps {
  reCaptchaKey: string;
  language?: string;
  useRecaptchaNet?: boolean;
  useEnterprise?: boolean;
  scriptProps?: {
    nonce?: string;
    defer?: boolean;
    async?: boolean;
    appendTo?: 'head' | 'body';
    id?: string;
    onLoadCallbackName?: string;
  };
  container?: {
    element?: string | HTMLElement;
    parameters: {
      badge?: 'inline' | 'bottomleft' | 'bottomright';
      theme?: 'dark' | 'light';
      tabindex?: number;
      callback?: () => void;
      expiredCallback?: () => void;
      errorCallback?: () => void;
    };
  };
  children: ReactNode;
}

export interface IGoogleReCaptchaConsumerProps {
  executeRecaptcha?: (action?: string) => Promise<string>;
  container?: string | HTMLElement;
}

const GoogleReCaptchaContext = createContext<IGoogleReCaptchaConsumerProps>({
  executeRecaptcha: () => {
    // This default context function is not supposed to be called
    throw Error(
      'GoogleReCaptcha Context has not yet been implemented, if you are using useGoogleReCaptcha hook, make sure the hook is called inside component wrapped by GoogleRecaptchaProvider'
    );
  }
});

const { Consumer: GoogleReCaptchaConsumer } = GoogleReCaptchaContext;

export function GoogleReCaptchaProvider({
  reCaptchaKey,
  useEnterprise = false,
  useRecaptchaNet = false,
  scriptProps,
  language,
  container,
  children
}: IGoogleReCaptchaProviderProps) {
  const greCaptchaInstancePromiseRef = useRef(
    promiseWithResolvers<null | {
      execute: (...args: any[]) => Promise<any>;
    }>()
  );
  const clientId = useRef<number | string>(reCaptchaKey);

  const scriptPropsJson = JSON.stringify(scriptProps);
  const parametersJson = JSON.stringify(container?.parameters);

  useEffect(() => {
    if (!reCaptchaKey) {
      logWarningMessage(
        '<GoogleReCaptchaProvider /> recaptcha key not provided'
      );
      greCaptchaInstancePromiseRef.current.resolve(null);

      return;
    }

    const scriptId = scriptProps?.id || 'google-recaptcha-v3';
    const onLoadCallbackName =
      scriptProps?.onLoadCallbackName || 'onRecaptchaLoadCallback';

    (window as unknown as { [key: string]: () => void })[onLoadCallbackName] =
      () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const grecaptcha = useEnterprise
          ? (window as any).grecaptcha.enterprise
          : (window as any).grecaptcha;

        const params = {
          badge: 'inline',
          size: 'invisible',
          sitekey: reCaptchaKey,
          ...(container?.parameters || {})
        };
        clientId.current = grecaptcha.render(container?.element, params);
      };

    const onLoad = () => {
      if (!window || !(window as any).grecaptcha) {
        logWarningMessage(
          `<GoogleRecaptchaProvider /> ${GoogleRecaptchaError.SCRIPT_NOT_AVAILABLE}`
        );
        greCaptchaInstancePromiseRef.current.resolve(null);

        return;
      }

      const grecaptcha = useEnterprise
        ? (window as any).grecaptcha.enterprise
        : (window as any).grecaptcha;

      grecaptcha.ready(() => {
        greCaptchaInstancePromiseRef.current.resolve(grecaptcha);
      });
    };

    const onError = () => {
      logWarningMessage('Error loading google recaptcha script');
      greCaptchaInstancePromiseRef.current.resolve(null);
    };

    injectGoogleReCaptchaScript({
      render: container?.element ? 'explicit' : reCaptchaKey,
      onLoadCallbackName,
      useEnterprise,
      useRecaptchaNet,
      scriptProps,
      language,
      onLoad,
      onError
    });

    return () => {
      cleanGoogleRecaptcha(scriptId, container?.element);
    };
  }, [
    useEnterprise,
    useRecaptchaNet,
    scriptPropsJson,
    parametersJson,
    language,
    reCaptchaKey,
    container?.element
  ]);

  const executeRecaptcha = useCallback(async (action?: string) => {
    const greCaptchaInstance = await greCaptchaInstancePromiseRef.current
      .promise;

    if (!greCaptchaInstance || !greCaptchaInstance.execute) {
      throw new Error(
        '<GoogleReCaptchaProvider /> Google Recaptcha has not been loaded'
      );
    }

    return await greCaptchaInstance.execute(clientId.current, { action });
  }, []);

  const googleReCaptchaContextValue = useMemo(
    () => ({
      executeRecaptcha,
      container: container?.element
    }),
    [executeRecaptcha, container?.element]
  );

  return (
    <GoogleReCaptchaContext.Provider value={googleReCaptchaContextValue}>
      {children}
    </GoogleReCaptchaContext.Provider>
  );
}

export { GoogleReCaptchaConsumer, GoogleReCaptchaContext };
