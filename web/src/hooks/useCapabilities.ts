import { useStatus } from '../api/hooks';

export interface Capabilities {
  /** "More like this" works from stored embeddings, even while gpubox is off. */
  similar: boolean;
  /** Describe-in-words needs gpubox online with an embedding model. */
  describe: boolean;
}

/** Which embedding-powered features to offer; all off until the status has loaded. */
export function useCapabilities(): Capabilities {
  const tagging = useStatus().data?.tagging;
  return {
    similar: Boolean(tagging?.embedModel),
    describe: Boolean(tagging?.describeAvailable),
  };
}
