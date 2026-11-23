// Shared JSDoc types of the app (AMD modules cannot import typedefs from each other).

/** A configured approval level (customrecord_gpv_approval_level). */
type GpvLevel = {
  /** Approval level record id. */
  id: string;
  name: string;
  /** 1-based position in the chain. */
  order: number;
  /** Bill checkbox (custbody_gpv_*_approval) that records this level's approval. */
  approvalField: string;
};
