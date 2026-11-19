/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Resolves custom list values from scriptid to internal ID (internal IDs differ per account).
 */
define(['N/search', 'N/error'], (
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/error')} */ error,
) => {
  /** listId -> (lowercase value scriptid -> internal id). Lives for one script execution. */
  /** @type {Record<string, Record<string, string>>} */
  const cache = {};

  const loadList = (/** @type {string} */ listId) => {
    /** @type {Record<string, string>} */
    const ids = {};
    search
      .create({ type: listId, columns: ['scriptid'] })
      .run()
      .each((result) => {
        // NetSuite returns value scriptids in upper case.
        ids[String(result.getValue('scriptid')).toLowerCase()] = String(result.id);
        return true;
      });
    return ids;
  };

  /**
   * Returns the internal ID of a custom list value.
   * @param {string} listId Custom list scriptid, e.g. 'customlist_gpv_action'.
   * @param {string} valueScriptId Value scriptid, e.g. 'val_gpv_approve'.
   * @returns {string}
   * @throws {Error} GPV_LIST_VALUE_NOT_FOUND when the value does not exist in the list.
   */
  const getValueId = (listId, valueScriptId) => {
    cache[listId] = cache[listId] || loadList(listId);
    const id = cache[listId][valueScriptId.toLowerCase()];
    if (!id) {
      throw error.create({
        name: 'GPV_LIST_VALUE_NOT_FOUND',
        message: `No existe el valor ${valueScriptId} en la lista ${listId}.`,
      });
    }
    return id;
  };

  return { getValueId };
});
