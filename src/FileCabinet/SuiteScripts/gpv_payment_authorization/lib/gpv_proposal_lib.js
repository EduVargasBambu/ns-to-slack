/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure rules to build a weekly payment proposal. No record or search access.
 */
define(['N/error', './gpv_legacy_lib'], (/** @type {typeof import('N/error')} */ error, legacy) => {
  /**
   * Checks the configured levels form a chain 1..n with an approval field each.
   * @param {GpvLevel[]} levels Sorted by order.
   * @throws {Error} GPV_INVALID_LEVELS
   */
  const validateLevels = (levels) => {
    const problems = [];
    if (!levels.length) problems.push('no hay niveles de aprobación activos');
    levels.forEach((level, index) => {
      if (level.order !== index + 1) {
        problems.push(
          `se esperaba el orden ${index + 1} y el nivel "${level.name}" tiene ${level.order}`,
        );
      }
      if (!level.approvalField)
        problems.push(`el nivel "${level.name}" no tiene Campo de aprobación`);
    });
    if (problems.length) {
      throw error.create({ name: 'GPV_INVALID_LEVELS', message: problems.join('; ') });
    }
  };

  /**
   * Starting state of a bill's line, from the approval checkboxes it already has.
   * @param {Record<string, unknown>} approvals Bill value per approval field.
   * @param {GpvLevel[]} levels Validated, sorted by order.
   * @returns {{ status: string, level: GpvLevel|null, levelsToClear: GpvLevel[] }}
   */
  const buildLine = (approvals, levels) => {
    const values = levels.map((level) => approvals[level.approvalField]);
    const { status, level } = legacy.getStartingState(values);
    return {
      status,
      level: level === null ? null : levels[level - 1],
      levelsToClear: legacy
        .getLevelsToClear(values)
        .map((/** @type {number} */ order) => levels[order - 1]),
    };
  };

  /**
   * Adds amounts per currency code, in cents to avoid float drift.
   * @param {{ amount: number, currency: string }[]} items
   * @returns {Record<string, number>} e.g. { MXN: 1500.5, USD: 20 }
   */
  const sumByCurrency = (items) => {
    /** @type {Record<string, number>} */
    const cents = {};
    items.forEach(({ amount, currency }) => {
      cents[currency] = (cents[currency] || 0) + Math.round(amount * 100);
    });
    return Object.fromEntries(Object.entries(cents).map(([code, c]) => [code, c / 100]));
  };

  /** @param {unknown} value Checkbox columns come back as true/false or 'T'/'F'. */
  const csvCell = (value) => {
    const text =
      value === true || value === 'T'
        ? 'Sí'
        : value === false || value === 'F'
          ? 'No'
          : String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  /**
   * CSV text for Excel: UTF-8 BOM (so Excel reads accents) and CRLF line ends.
   * @param {string[]} headers
   * @param {unknown[][]} rows
   * @returns {string}
   */
  const toCsv = (headers, rows) =>
    '﻿' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

  return { validateLevels, buildLine, sumByCurrency, toCsv };
});
