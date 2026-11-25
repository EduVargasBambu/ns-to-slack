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
  /** Employee internal id allowed to approve this level. */
  approverId: string;
  /** Optional stand-in approver; '' when there is none. */
  substituteId: string;
  /** True when this level's approvers approve by signed external link (no NetSuite login). */
  externalLink: boolean;
};
