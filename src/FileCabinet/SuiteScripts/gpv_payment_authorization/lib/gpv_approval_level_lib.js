/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Reads the configured approval levels.
 */
define(['N/search', './gpv_constants_lib', './gpv_proposal_lib'], (
  /** @type {typeof import('N/search')} */ search,
  constants,
  proposalLib,
) => {
  const { ApprovalLevel } = constants;

  /**
   * Active approval levels sorted by order.
   * @returns {GpvLevel[]}
   * @throws {Error} GPV_INVALID_LEVELS when they do not form a chain 1..n with an approval field each.
   */
  const getLevels = () => {
    /** @type {GpvLevel[]} */
    const levels = [];
    search
      .create({
        type: ApprovalLevel.RECORD,
        filters: [['isinactive', 'is', 'F']],
        columns: [
          search.createColumn({ name: ApprovalLevel.ORDER, sort: search.Sort.ASC }),
          'name',
          ApprovalLevel.APPROVAL_FIELD,
        ],
      })
      .run()
      .each((result) => {
        levels.push({
          id: String(result.id),
          name: String(result.getValue('name')),
          order: Number(result.getValue(ApprovalLevel.ORDER)),
          approvalField: String(result.getValue(ApprovalLevel.APPROVAL_FIELD) || '').trim(),
        });
        return true;
      });
    proposalLib.validateLevels(levels);
    return levels;
  };

  return { getLevels };
});
